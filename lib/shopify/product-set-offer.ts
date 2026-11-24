import "server-only";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { Product } from "@/lib/catalog";
import { setCombinations, type SetOffer } from "@/lib/product-sets";
import { adminGraphQL } from "./admin-bundles";
import { storefront } from "./client";

type Result = { userErrors: { message: string }[] };
type Parent = {
  id: string; tags: string[]; status: string;
  variants: { nodes: { id: string; sku: string }[] };
};
const fields = "id tags status variants(first: 250) { nodes { id sku } }";
type SavedVariant = {
  id: string; price: string; requiresComponents: boolean;
  productVariantComponents: { nodes: { quantity: number; productVariant: { id: string } }[]; pageInfo: { hasNextPage: boolean } };
};

async function inspectSet(variants: SetOffer["variants"], price: number) {
  const missing: SetOffer["variants"] = [];
  let verified = 0;
  const count = variants[0].components.length;
  // Keep nested connections within the Admin API's per-query cost limit.
  const batchSize = Math.min(50, Math.floor(400 / (count + 2)));
  for (let offset = 0; offset < variants.length; offset += batchSize) {
    const batch = variants.slice(offset, offset + batchSize);
    const { nodes } = await adminGraphQL<{ nodes: (SavedVariant | null)[] }>(
      `query ReadSetComponents($ids:[ID!]!, $count:Int!) {
        nodes(ids:$ids) { ... on ProductVariant { id price requiresComponents
          productVariantComponents(first:$count) { nodes { quantity productVariant { id } } pageInfo { hasNextPage } }
        } }
      }`, { ids: batch.map(v => v.id), count });
    const saved = new Map(nodes.flatMap(v => v ? [[v.id, v] as const] : []));
    for (const expected of batch) {
      const v = saved.get(expected.id);
      if (!v) continue;
      const components = v.productVariantComponents.nodes;
      if (v.productVariantComponents.pageInfo.hasNextPage || components.some(c => c.quantity !== 1 || !expected.components.includes(c.productVariant.id))) {
        throw new Error("הפריטים שנשמרו בהרכב ב־Shopify שונים מהפריטים שנבחרו לסט.");
      }
      const absent = expected.components.filter(id => !components.some(c => c.productVariant.id === id));
      if (absent.length) missing.push({ id: v.id, components: absent });
      else if (v.requiresComponents && Number(v.price) === price) verified++;
    }
  }
  return { verified, missing };
}
function check(result: Result) {
  if (result.userErrors.length) throw new Error(result.userErrors.map(e => e.message).join(" · "));
}
export async function setOfferStatus(id: string, status: "ARCHIVED" | "ACTIVE") {
  const { productUpdate } = await adminGraphQL<{ productUpdate: Result }>(
    "mutation SetStatus($p:ProductUpdateInput!) { productUpdate(product:$p) { userErrors { message } } }", { p: { id, status } });
  check(productUpdate);
}

export async function prepareSetOffer(items: Product[], price: number, onPublish: (id: string) => void): Promise<SetOffer> {
  const combos = setCombinations(items);
  const publicationId = process.env.SHOPIFY_BUNDLE_PUBLICATION_ID?.trim();
  if (!publicationId) throw new Error("חסר ערוץ פרסום לבאנדלים ב־Shopify.");
  // A revision has its own parent, so a failed edit cannot change a live set's contents.
  const digest = createHash("sha256").update(JSON.stringify([items.map(p => p.id), combos, price])).digest("hex").slice(0, 24);
  const handle = "ahim-bundle-" + digest;
  const tag = "complete-set:" + digest;
  const { productByIdentifier } = await adminGraphQL<{ productByIdentifier: Parent | null }>(
    `query FindSet($handle:ProductIdentifierInput!) { productByIdentifier(identifier:$handle) { ${fields} } }`, { handle: { handle } });
  let parent = productByIdentifier;
  if (parent && !parent.tags.includes(tag)) throw new Error("כתובת המוצר ב־Shopify כבר בשימוש.");
  const name = (i: number) => `הרכב ${i + 1}`;
  const sku = (i: number) => `SET-${digest}-${i + 1}`;
  if (!parent) {
    const { productSet } = await adminGraphQL<{ productSet: Result & { product: Parent | null } }>(
      `mutation MakeSet($input:ProductSetInput!) { productSet(input:$input,synchronous:true) { product { ${fields} } userErrors { message } } }`,
      { input: {
        title: ("סט — " + items.map(p => p.name).join(" + ")).slice(0, 255), handle, tags: [tag, "bundle"], status: "DRAFT",
        productOptions: [{ name: "הרכב הסט", values: combos.map((_, i) => ({ name: name(i) })) }],
        variants: combos.map((_, i) => ({ sku: sku(i), price: price.toFixed(2), optionValues: [{ optionName: "הרכב הסט", name: name(i) }] })),
      } });
    check(productSet);
    parent = productSet.product;
  }
  if (!parent) throw new Error("יצירת הסט ב־Shopify נכשלה.");
  const bySku = new Map(parent.variants.nodes.map(v => [v.sku, v]));
  const variants = combos.map((components, i) => {
    const v = bySku.get(sku(i));
    if (!v) throw new Error("לא נמצאו כל וריאציות הסט ב־Shopify.");
    return { id: v.id, components };
  });
  // On retry the draft may already contain links written by an earlier request.
  let state = productByIdentifier ? await inspectSet(variants, price) : { verified: 0, missing: variants };
  const { missing } = state;
  if (missing.length) {
    const { productVariantRelationshipBulkUpdate: linked } = await adminGraphQL<{ productVariantRelationshipBulkUpdate: Result }>(`mutation LinkSet($input:[ProductVariantRelationshipUpdateInput!]!) {
      productVariantRelationshipBulkUpdate(input:$input) { userErrors { message } }
    }`, { input: missing.map(v => ({ parentProductVariantId: v.id, priceInput: { calculation: "FIXED", price: price.toFixed(2) },
      productVariantRelationshipsToCreate: v.components.map(id => ({ id, quantity: 1 })) })) });
    check(linked);
  }
  for (const wait of [0, 400, 1000, 2000]) {
    if (state.verified === variants.length) break;
    if (wait) await delay(wait);
    state = await inspectSet(variants, price);
  }
  if (state.verified !== variants.length) {
    throw new Error(`אומתו ${state.verified} מתוך ${variants.length} הרכבים במחיר ${price} ₪ ב־Shopify. נסו לשמור שוב כדי להשלים את האימות.`);
  }
  onPublish(parent.id);
  if (parent.status !== "ACTIVE") await setOfferStatus(parent.id, "ACTIVE");
  await publishSet(parent.id, publicationId);
  for (const wait of [0, 500, 1500]) {
    if (wait) await delay(wait);
    const { nodes } = await storefront<{ nodes: ({ id: string; price: { amount: string; currencyCode: string } } | null)[] }>(
      "query VerifySet($ids:[ID!]!) { nodes(ids:$ids) { ... on ProductVariant { id price { amount currencyCode } } } }",
      { ids: variants.map(v => v.id) });
    if (nodes.length === variants.length && nodes.every((v, i) => v?.id === variants[i].id && v.price.currencyCode === "ILS" && Number(v.price.amount) === price)) {
      return { shopifyId: parent.id, price, variants };
    }
  }
  throw new Error("מחיר הסט עדיין לא אומת בערוץ המכירה. נסו לשמור שוב.");
}

async function publishSet(id: string, publicationId: string) {
  const { publishablePublish } = await adminGraphQL<{ publishablePublish: Result }>(
    "mutation PublishSet($id:ID!,$input:[PublicationInput!]!) { publishablePublish(id:$id,input:$input) { userErrors { message } } }",
    { id, input: [{ publicationId }] });
  check(publishablePublish);
}

export async function restoreSetOffer(id: string) {
  await setOfferStatus(id, "ACTIVE");
  await publishSet(id, process.env.SHOPIFY_BUNDLE_PUBLICATION_ID!.trim());
}

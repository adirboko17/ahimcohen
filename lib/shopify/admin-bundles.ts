import "server-only";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { Product } from "@/lib/catalog";
import { bundleRevision, fetchBundleMappings, saveBundleMapping } from "@/lib/admin/bundle-mapping";
import { quantityOfferMappingKey, type AdminBundle } from "@/lib/admin/models";
import { storefront } from "./client";
import { shopDomain, storefrontApiVersion } from "./config";

type UserError = { message: string };
type AdminVariant = { id: string; sku: string | null; price: string };
type ShopifyBundle = { id: string; tags: string[]; publishedOnPublication: boolean; variants: { nodes: AdminVariant[] } };

let cachedToken: { shop: string; token: string; expires: number } | undefined;
let tokenRequest: Promise<string> | undefined;

async function adminToken(shop: string) {
  const token = process.env.SHOPIFY_ADMIN_API_TOKEN?.trim();
  if (token) return token;
  const clientId = process.env.SHOPIFY_CLIENT_ID?.trim();
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new Error("נדרש חיבור Shopify Admin כדי ליצור מוצר באנדל.");
  if (cachedToken?.shop === shop && cachedToken.expires > Date.now() + 60000) return cachedToken.token;
  tokenRequest ??= fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST", cache: "no-store", signal: AbortSignal.timeout(6500),
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
  }).then(async (response) => {
    const body = await response.json().catch(() => null);
    if (!response.ok || typeof body?.access_token !== "string") throw new Error("Shopify לא אישרה גישה לממשק הניהול.");
    const expiresIn = Number(body.expires_in);
    cachedToken = { shop, token: body.access_token, expires: Date.now() + (Number.isFinite(expiresIn) ? expiresIn : 0) * 1000 };
    return body.access_token as string;
  }).finally(() => { tokenRequest = undefined; });
  return tokenRequest;
}

export async function adminGraphQL<T>(query: string, variables: Record<string, unknown>) {
  const shop = shopDomain();
  const response = await fetch(`https://${shop}/admin/api/${storefrontApiVersion()}/graphql.json`, {
    method: "POST", cache: "no-store", signal: AbortSignal.timeout(12000),
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": await adminToken(shop) },
    body: JSON.stringify({ query, variables }),
  });
  const body = await response.json().catch(() => null) as { data?: T; errors?: unknown[] } | null;
  if (!response.ok || body?.errors?.length || !body?.data) {
    throw new Error("Shopify Admin לא השלימה את הפעולה. בדקו את הרשאות המוצרים והפרסום.");
  }
  return body.data;
}

function checkErrors(errors: UserError[]) {
  if (errors.length) throw new Error(errors.map(({ message }) => message).join(" · "));
}

const VARIANT_ID = /^gid:\/\/shopify\/ProductVariant\/([0-9]+)$/;

export async function syncManagedBundle(sourceProductId: string, source: Product | undefined, tiers: AdminBundle[], kind: "bundle" | "quantity-offer" = "bundle") {
  const quantityOffer = kind === "quantity-offer";
  const mappingKey = quantityOffer ? quantityOfferMappingKey(sourceProductId) : sourceProductId;
  const publicationId = process.env.SHOPIFY_BUNDLE_PUBLICATION_ID?.trim();
  if (!publicationId || !/^gid:\/\/shopify\/Publication\/\d+$/.test(publicationId)) {
    throw new Error("נדרש מזהה ערוץ המכירה של האתר ב־Shopify.");
  }
  await adminToken(shopDomain());
  const [previous] = await fetchBundleMappings(mappingKey);
  const handle = `ahim-bundle-${createHash("sha256").update(mappingKey).digest("hex").slice(0, 24)}`;
  const tag = `managed:${handle}`;
  const findBundle = (identifier: { id: string } | { handle: string }) => adminGraphQL<{ productByIdentifier: ShopifyBundle | null }>(
    `query BundleTarget($identifier: ProductIdentifierInput!, $publication: ID!) {
      productByIdentifier(identifier: $identifier) {
        id tags publishedOnPublication(publicationId: $publication)
        variants(first: 250) { nodes { id sku price } }
      }
    }`, { identifier, publication: publicationId },
  );
  const { productByIdentifier: matched } = await findBundle(previous ? { id: previous.shopify_product_id } : { handle });
  const existing = matched ?? (previous ? (await findBundle({ handle })).productByIdentifier : null);
  if (existing && !existing.tags.includes(tag)) throw new Error("מוצר Shopify שמור לבאנדל אחר או למוצר רגיל.");

  if (tiers.length === 0) {
    if (!existing) return;
    await saveBundleMapping({ source_product_id: mappingKey, shopify_product_id: existing.id, revision: "", variants: [] });
    const { productUpdate } = await adminGraphQL<{ productUpdate: { userErrors: UserError[] } }>(
      `mutation ArchiveBundle($product: ProductUpdateInput!) { productUpdate(product: $product) { userErrors { message } } }`,
      { product: { id: existing.id, status: "ARCHIVED" } },
    );
    checkErrors(productUpdate.userErrors);
    return;
  }
  if (!source) throw new Error("מוצר הבסיס אינו מופיע בקטלוג.");

  const baseChoices = new Map(source.choices?.map((variant) => [variant.id, variant]));
  const referenced = [...new Set(tiers.flatMap((tier) => tier.sourceVariantIds ?? []))];
  const labels = referenced.map((id) => {
    const choice = baseChoices.get(id);
    const numericId = VARIANT_ID.exec(id)?.[1];
    if (!choice || !numericId) throw new Error("אחת הווריאציות שנבחרו כבר אינה בקטלוג.");
    return { id, numericId, label: [choice.color, choice.size].filter(Boolean).join(" / ") || "ברירת מחדל" };
  });
  const variantLabels = new Map(labels.map(({ id, numericId, label }) => [id, {
    numericId, name: labels.filter((variant) => variant.label === label).length > 1 ? `${label} (${numericId})` : label,
  }]));
  const quantityName = (quantity: number) => `${quantity} יחידות`;
  const rows = tiers.flatMap((tier) => (tier.sourceVariantIds ?? []).map((sourceVariantId) => {
    const choice = variantLabels.get(sourceVariantId)!;
    const quantity = tier.items[0][1];
    const price = tier.total;
    if (!(price !== undefined && Number.isFinite(price) && price > 0)) throw new Error("הזינו מחיר תקין לכל כמות.");
    return { tierId: tier.id, sourceVariantId, sku: `${quantityOffer ? "AHQ" : "AHB"}-${quantity}-${choice.numericId}`, price,
      optionValues: [{ optionName: "וריאציה", name: choice.name }, { optionName: "כמות", name: quantityName(quantity) }] };
  }));
  if (!rows.length || rows.length > 250) throw new Error("אפשר לסנכרן עד 250 שילובים של כמות ווריאציה למוצר אחד.");

  if (existing) await saveBundleMapping({ source_product_id: mappingKey, shopify_product_id: existing.id, revision: "", variants: [] });
  const oldBySku = new Map(existing?.variants.nodes.map((variant) => [variant.sku, variant.id]));
  const { productSet } = await adminGraphQL<{ productSet: { product: ShopifyBundle | null; userErrors: UserError[] } }>(
    `mutation SetBundle($input: ProductSetInput!, $identifier: ProductSetIdentifiers!, $publication: ID!) {
      productSet(input: $input, identifier: $identifier, synchronous: true) {
        product { id publishedOnPublication(publicationId: $publication) variants(first: 250) { nodes { id sku price } } }
        userErrors { message }
      }
    }`, {
      publication: publicationId,
      identifier: existing ? { id: existing.id } : { handle },
      input: {
        title: `${source.name} — ${quantityOffer ? "מבצע כמות" : "באנדל"}`, handle, status: "ACTIVE", tags: ["bundle", tag],
        ...(source.brand ? { vendor: source.brand } : {}),
        ...(!existing && source.imgs?.[0] ? { files: [{ originalSource: source.imgs[0], contentType: "IMAGE" }] } : {}),
        productOptions: [
          { name: "וריאציה", values: [...variantLabels.values()].map(({ name }) => ({ name })) },
          { name: "כמות", values: tiers.map((tier) => ({ name: quantityName(tier.items[0][1]) })) },
        ],
        variants: rows.map(({ price, sku, optionValues }) => ({
          id: oldBySku.get(sku), sku, optionValues, price: price.toFixed(2), inventoryPolicy: "CONTINUE", inventoryItem: { tracked: false, requiresShipping: true },
        })),
      },
    },
  );
  checkErrors(productSet.userErrors);
  const bundle = productSet.product;
  if (!bundle) throw new Error("Shopify לא החזירה את מוצר הבאנדל.");
  const returned = new Map(bundle.variants.nodes.map((variant) => [variant.sku, variant]));
  const variants = rows.map(({ tierId, sourceVariantId, sku, price }) => {
    const variant = returned.get(sku);
    if (!variant || !VARIANT_ID.test(variant.id) || Number(variant.price) !== price) throw new Error("Shopify לא החזירה את כל וריאציות הבאנדל במחיר הנכון.");
    return { tierId, sourceVariantId, variantId: variant.id, price };
  });

  if (!bundle.publishedOnPublication) {
    const { publishablePublish } = await adminGraphQL<{ publishablePublish: { userErrors: UserError[] } }>(
      `mutation PublishBundle($id: ID!, $input: [PublicationInput!]!) { publishablePublish(id: $id, input: $input) { userErrors { message } } }`,
      { id: bundle.id, input: [{ publicationId }] },
    );
    checkErrors(publishablePublish.userErrors);
  }

  // A newly published variant can take a moment to appear in Storefront API.
  for (const pause of [0, 350, 900]) {
    if (pause) await delay(pause);
    const { nodes } = await storefront<{ nodes: ({ id: string; availableForSale: boolean; price: { amount: string; currencyCode: string } } | null)[] }>(
      `query CheckBundleVariants($ids: [ID!]!) { nodes(ids: $ids) { ... on ProductVariant { id availableForSale price { amount currencyCode } } } }`,
      { ids: variants.map(({ variantId }) => variantId) },
    );
    const live = new Map(nodes.flatMap((node) => node ? [[node.id, node] as const] : []));
    const verified = variants.every(({ variantId, price }) => {
      const item = live.get(variantId);
      return item?.availableForSale && item.price.currencyCode === "ILS" && Number(item.price.amount) === price;
    });
    if (verified) {
      await saveBundleMapping({ source_product_id: mappingKey, shopify_product_id: bundle.id, revision: bundleRevision(tiers), variants });
      return;
    }
  }
  throw new Error("וריאציות הבאנדל עדיין אינן זמינות במחיר הנכון בערוץ המכירה של האתר.");
}

import "server-only";
import { setTimeout as pause } from "node:timers/promises";
import { adminGraphQL } from "@/lib/shopify/admin-bundles";
import { storefront } from "@/lib/shopify/client";
import { scanRedback, isPilotId, type SupplierProduct } from "./redback";
import { scanWooProduct } from "./woocommerce";
import { rescanShopify } from "./shopify-source";
import { productDomain, supplierKey } from "./catalog-model";
import { readDraft, verifyDraft, type SupplierShopifyProduct } from "./shopify";
import { savePreview, withLinkedProductLock, type Preview } from "./storage";

type ChannelProduct = {
  id: string; handle: string; status: string; onSite: boolean;
  otherChannels: { nodes: { publication: { id: string } }[]; pageInfo: { hasNextPage: boolean } };
};

function sitePublication() {
  const id = process.env.SHOPIFY_BUNDLE_PUBLICATION_ID?.trim();
  if (!id || !/^gid:\/\/shopify\/Publication\/\d+$/.test(id)) throw new Error("ערוץ המכירה של האתר אינו מוגדר.");
  return id;
}

export async function publicationStates(ids: string[]) {
  if (!ids.length) return [];
  const data = await adminGraphQL<{ nodes: (ChannelProduct | null)[] }>(
    `query SupplierChannels($ids:[ID!]!, $channel:ID!){ nodes(ids:$ids){ ... on Product {
      id handle status onSite:publishedOnPublication(publicationId:$channel)
      otherChannels:resourcePublicationsV2(first:50,onlyPublished:false){nodes{publication{id}} pageInfo{hasNextPage}}
    } } }`, { ids, channel: sitePublication() });
  return data.nodes.filter((product): product is ChannelProduct => product !== null);
}
export async function catalogPublicationStates(ids: string[]) {
  if (!ids.length) return [];
  type Status = Pick<ChannelProduct,"id"|"status"|"onSite">;
  const data = await adminGraphQL<{nodes:(Status|null)[]}>(
    `query SupplierCatalogStatuses($ids:[ID!]!, $channel:ID!){nodes(ids:$ids){... on Product{
      id status onSite:publishedOnPublication(publicationId:$channel)
    }}}`, {ids,channel:sitePublication()});
  return data.nodes.filter((s):s is Status => !!s);
}

function checkErrors(result: { userErrors: { message: string }[] }) {
  if (result.userErrors.length) throw new Error(result.userErrors.map(e => e.message).join(" · "));
}

export function stockPlan(product: SupplierShopifyProduct, fresh: SupplierProduct) {
  const source = new Map(fresh.variants.map(v => [v.id, v]));
  const variants = product.variants.nodes;
  if (source.size !== variants.length || new Set(variants.map(v => v.source?.value)).size !== variants.length) {
    throw new Error("רשימת הווריאציות השתנתה. יש לבדוק את ההתאמה לפני עדכון המלאי.");
  }
  return variants.map(variant => {
    const match = source.get(variant.source?.value ?? "");
    if (!match || variant.selectedOptions.length !== Object.keys(match.options).length ||
      variant.selectedOptions.some(option => match.options[option.name] !== option.value)) {
      throw new Error("מידה או צבע אינם תואמים לווריאציה המקושרת.");
    }
    if (!variant.inventoryItem.tracked) throw new Error("מעקב המלאי כבוי בווריאציה המקושרת.");
    const policy = match.available ? "CONTINUE" : "DENY";
    const value = match.available ? "in_stock" : "out_of_stock";
    return {
      id: variant.id, policy, value,
      changed: variant.inventoryPolicy !== policy || variant.availability?.value !== value,
      sellable: match.available || variant.sellableOnlineQuantity > 0,
    };
  });
}

async function syncAvailability(id: string, plan: ReturnType<typeof stockPlan>) {
  const changes = plan.filter(item => item.changed).map(item => ({
    id: item.id, inventoryPolicy: item.policy,
    metafields: [{ namespace: "ahim_supplier", key: "source_availability", type: "single_line_text_field", value: item.value }],
  }));
  if (!changes.length) return;
  const { productVariantsBulkUpdate } = await adminGraphQL<{
    productVariantsBulkUpdate: { userErrors: { message: string }[] };
  }>(`mutation SupplierStock($id:ID!, $variants:[ProductVariantsBulkInput!]!){
    productVariantsBulkUpdate(productId:$id, variants:$variants, allowPartialUpdates:false){ userErrors{message} }
  }`, { id, variants: changes });
  checkErrors(productVariantsBulkUpdate);
}

async function makeVisible(product: ChannelProduct) {
  if (!product.onSite) {
    const { publishablePublish } = await adminGraphQL<{ publishablePublish: { userErrors: { message: string }[] } }>(
      `mutation PublishSupplierToSite($id:ID!, $channel:ID!){publishablePublish(id:$id,input:[{publicationId:$channel}]){userErrors{message}}}`,
      { id: product.id, channel: sitePublication() });
    checkErrors(publishablePublish);
  }
  if (product.status === "DRAFT") {
    const { productUpdate } = await adminGraphQL<{ productUpdate: { userErrors: { message: string }[] } }>(
      `mutation ActivateSupplierProduct($id:ID!){productUpdate(product:{id:$id,status:ACTIVE}){userErrors{message}}}`, { id: product.id });
    checkErrors(productUpdate);
  }
}

async function verifyOnSite(plan: ReturnType<typeof stockPlan>) {
  for (const delay of [0, 500, 1500, 3000]) {
    if (delay) await pause(delay);
    const data = await storefront<{ nodes: ({ id: string; availableForSale: boolean } | null)[] }>(
      `query SupplierLiveVariants($ids:[ID!]!){nodes(ids:$ids){... on ProductVariant{id availableForSale}}}`,
      { ids: plan.map(item => item.id) });
    const live = new Map(data.nodes.flatMap(v => v ? [[v.id, v.availableForSale] as const] : []));
    if (plan.every(v => live.get(v.id) === v.sellable)) return;
  }
  throw new Error("Shopify טרם אישרה באתר את זמינות כל הווריאציות. לחצו על סרוק עכשיו לבדיקה חוזרת.");
}

export async function refreshLinkedProduct(row: Preview, publish: boolean) {
  return withLinkedProductLock(row, async () => {
    const id = row.shopify_product_id!;
    const [fresh, [channelProduct], product] = await Promise.all([
      row.snapshot.platform === "shopify" ? rescanShopify(row.snapshot) :
        row.snapshot.domain || !isPilotId(row.source_id) ? scanWooProduct(productDomain(row.snapshot),row.source_id) : scanRedback(row.source_id), publicationStates([id]), readDraft({ id }),
    ]);
    if (!product || !channelProduct || product.source?.value !== row.source_id || !product.tags.includes("supplier:"+supplierKey(productDomain(row.snapshot)))) {
      throw new Error("לא ניתן לאמת את הקישור בין המוצר לספק.");
    }
    const live = channelProduct.status === "ACTIVE" && channelProduct.onSite;
    if (!publish && !live) {
      await savePreview(fresh);
      return { live: false, handle: channelProduct.handle };
    }
    if (!live) {
      if (!["ACTIVE","DRAFT"].includes(channelProduct.status)) throw new Error("מצב המוצר אינו מאפשר פרסום.");
      if (channelProduct.status === "DRAFT" && (channelProduct.otherChannels.pageInfo.hasNextPage ||
        channelProduct.otherChannels.nodes.some(node => node.publication.id !== sitePublication()))) {
        throw new Error("לטיוטה משויכים ערוצים נוספים. יש להסיר את שיוכם כדי לפרסם רק באתר.");
      }
      if (!row.collection_ids.length) throw new Error("לטיוטה אין אוספים מאושרים.");
      verifyDraft(product, row.draft_snapshot || row.snapshot, row.collection_ids, false);
    }
    const plan = stockPlan(product, fresh);
    await syncAvailability(id, plan);
    if (!live) await makeVisible(channelProduct);
    await verifyOnSite(plan);
    await savePreview(fresh);
    return { live: true, handle: channelProduct.handle };
  });
}

import "server-only";
import { setTimeout as pause } from "node:timers/promises";
import { adminGraphQL } from "@/lib/shopify/admin-bundles";
import { storefront } from "@/lib/shopify/client";
import { scanRedback, isPilotId, type SupplierProduct } from "./redback";
import { scanWooProduct } from "./woocommerce";
import { rescanShopify } from "./shopify-source";
import { productDomain, supplierKey, type StockChange } from "./catalog-model";
import { importStatuses } from "./import-queue";
import { finishStockUpdate, pendingStockUpdate, stageStockUpdate } from "./monitor-report";
import { readDraft, repairImportedSalePrices, verifyDraft, type SupplierShopifyProduct } from "./shopify";
import { savePreview, withLinkedProductLock, type Preview } from "./storage";

type SupplierLink = Pick<SupplierShopifyProduct, "source" | "tags">;
type ChannelProduct = SupplierLink & {
  id: string; handle: string; status: string; onSite: boolean; vendor: string;
  otherChannels: { nodes: { publication: { id: string } }[]; pageInfo: { hasNextPage: boolean } };
};

export function sitePublication() {
  const id = process.env.SHOPIFY_BUNDLE_PUBLICATION_ID?.trim();
  if (!id || !/^gid:\/\/shopify\/Publication\/\d+$/.test(id)) throw new Error("ערוץ המכירה של האתר אינו מוגדר.");
  return id;
}

export async function publicationStates(ids: string[]) {
  if (!ids.length) return [];
  const data = await adminGraphQL<{ nodes: (ChannelProduct | null)[] }>(
    `query SupplierChannels($ids:[ID!]!, $channel:ID!){ nodes(ids:$ids){ ... on Product {
      id handle status vendor onSite:publishedOnPublication(publicationId:$channel)
      tags source:metafield(namespace:"ahim_supplier",key:"product_id"){value}
      otherChannels:resourcePublicationsV2(first:50,onlyPublished:false){nodes{publication{id}} pageInfo{hasNextPage}}
    } } }`, { ids, channel: sitePublication() });
  return data.nodes.filter((product): product is ChannelProduct => product !== null);
}
export async function catalogPublicationStates(ids: string[]) {
  if (!ids.length) return [];
  type Status = Pick<ChannelProduct,"id"|"handle"|"status"|"onSite"|"vendor">;
  const data = await adminGraphQL<{nodes:(Status|null)[]}>(
    `query SupplierCatalogStatuses($ids:[ID!]!, $channel:ID!){nodes(ids:$ids){... on Product{
      id handle status vendor onSite:publishedOnPublication(publicationId:$channel)
    }}}`, {ids,channel:sitePublication()});
  return data.nodes.filter((s):s is Status => !!s);
}

function checkErrors(result: { userErrors: { message: string }[] }) {
  if (result.userErrors.length) throw new Error(result.userErrors.map(e => e.message).join(" · "));
}

function verifySupplierLink(row: Preview, product?: SupplierLink | null) {
  const supplier = supplierKey(productDomain(row.snapshot));
  if (product?.source?.value !== row.source_id || !product.tags.includes("supplier:" + supplier)) {
    throw new Error("לא ניתן לאמת את הקישור בין המוצר לספק.");
  }
}

export async function unpublishLinkedProduct(row: Preview) {
  return withLinkedProductLock(row, async () => {
    const id = row.shopify_product_id!;
    const [[product], tasks] = await Promise.all([
      publicationStates([id]),
      importStatuses(productDomain(row.snapshot), [row.source_id]),
    ]);
    verifySupplierLink(row, product);
    if (tasks.some(task => task.intent === "publish" && (task.state === "queued" || task.state === "running"))) {
      throw new Error("המוצר בתור לפרסום. אפשר להסיר אותו אחרי שפעולת הפרסום תסתיים.");
    }
    if (!product.onSite) return;
    const { publishableUnpublish } = await adminGraphQL<{
      publishableUnpublish: { publishable: { onSite: boolean } | null; userErrors: { message: string }[] };
    }>(`mutation UnpublishSupplierFromSite($id:ID!, $channel:ID!){
      publishableUnpublish(id:$id,input:[{publicationId:$channel}]){
        publishable{onSite:publishedOnPublication(publicationId:$channel)}
        userErrors{message}
      }
    }`, { id, channel: sitePublication() });
    checkErrors(publishableUnpublish);
    if (publishableUnpublish.publishable?.onSite !== false) {
      throw new Error("Shopify טרם אישרה את הסרת המוצר מהאתר. רעננו את הרשימה ובדקו שוב.");
    }
  });
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
    const before = variant.availability?.value === "in_stock" ? true : variant.availability?.value === "out_of_stock" ? false : null;
    return {
      id: variant.id, policy, value,
      options: match.options, before, after: match.available,
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

async function verifyOnSite(plan: Pick<ReturnType<typeof stockPlan>[number], "id" | "sellable">[]) {
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

async function recoverStockUpdate(domain: string, id: string, product: SupplierShopifyProduct, onStockApplied: () => void) {
  const pending = await pendingStockUpdate(domain, id);
  if (!pending) return;
  const current = new Map(product.variants.nodes.map(variant => [variant.id, variant]));
  const verified = pending.changes.flatMap(change => {
    const variant = current.get(change.variantId);
    if (variant?.availability?.value !== (change.after ? "in_stock" : "out_of_stock") ||
        variant.inventoryPolicy !== (change.after ? "CONTINUE" : "DENY")) return [];
    return [{ id: variant.id, sellable: change.after || variant.sellableOnlineQuantity > 0 }];
  });
  const applied = verified.length === pending.changes.length;
  if (applied) await verifyOnSite(verified);
  await finishStockUpdate(domain, pending.id, applied);
  if (applied) onStockApplied();
}

export async function refreshLinkedProduct(row: Preview, publish: boolean, onStockApplied?: () => void) {
  return withLinkedProductLock(row, async token => {
    const id = row.shopify_product_id!;
    const [fresh, [channelProduct], product] = await Promise.all([
      row.snapshot.platform === "shopify" ? rescanShopify(row.snapshot) :
        row.snapshot.domain || !isPilotId(row.source_id) ? scanWooProduct(productDomain(row.snapshot),row.source_id) : scanRedback(row.source_id), publicationStates([id]), readDraft({ id }),
    ]);
    if (!product || !channelProduct) {
      throw new Error("לא ניתן לאמת את הקישור בין המוצר לספק.");
    }
    verifySupplierLink(row, product);
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
      const repaired = await repairImportedSalePrices(row, product, token);
      verifyDraft(repaired.product, repaired.snapshot ?? row.snapshot, row.collection_ids, false);
    }
    const domain = productDomain(row.snapshot);
    if (onStockApplied && live) await recoverStockUpdate(domain, row.source_id, product, onStockApplied);
    const plan = stockPlan(product, fresh);
    let event: string | undefined;
    if (onStockApplied && live) {
      const changes: StockChange[] = plan.filter(item => item.before !== item.after).map(item => ({
        variantId: item.id, options: item.options, before: item.before, after: item.after, siteAvailable: item.sellable,
      }));
      if (changes.length) {
        event = await stageStockUpdate(domain, row.source_id, fresh.title, channelProduct.handle, changes);
      }
    }
    await syncAvailability(id, plan);
    if (!live) await makeVisible(channelProduct);
    await verifyOnSite(plan);
    if (plan.some(item => item.changed)) onStockApplied?.();
    if (event) await finishStockUpdate(domain, event, true);
    await savePreview(fresh);
    return { live: true, handle: channelProduct.handle };
  });
}

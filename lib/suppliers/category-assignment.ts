import "server-only";
import { setTimeout as pause } from "node:timers/promises";
import { revalidateTag } from "next/cache";
import { storefrontCategoryLabels } from "@/lib/category-placement";
import { mappedCollections, type Site } from "./catalog-model";
import { addSupplierCollectionMembership, markSupplierCategoryReviewed, removeSupplierCollectionMembership, supplierCollectionMemberships } from "./shopify";
import { getPreview, saveLinkedProductCategories, saveProductCategory, withLinkedProductLock, type Preview } from "./storage";
import type { SupplierCollectionOption } from "./storefront-collections";

export type CategoryAssignmentMode = "add" | "replace";
export type CategoryAssignmentResult = {
  assigned: { id: string; current: string[] }[];
  failed: { id: string; message: string }[];
};

async function linkedMemberships(productId: string) {
  const current = (await supplierCollectionMemberships([productId])).get(productId);
  if (!current) throw new Error("המוצר המקושר לא נמצא ב־Shopify.");
  return current;
}

async function updateLinkedCategory(site: Site, row: Preview, collection: string, removable: Set<string>) {
  return withLinkedProductLock(row, async () => {
    const latest = await getPreview(site.domain, row.source_id);
    if (!latest || latest.revision !== row.revision || latest.shopify_product_id !== row.shopify_product_id)
      throw new Error("נתוני המוצר השתנו. רעננו את הדוח.");
    const productId = latest.shopify_product_id!;
    let current = await linkedMemberships(productId);
    const toRemove = current.filter(id => removable.has(id));
    if (!current.includes(collection)) {
      await addSupplierCollectionMembership(productId, collection);
      current = await linkedMemberships(productId);
      if (!current.includes(collection)) throw new Error("Shopify טרם אישרה את השיוך החדש. אפשר לנסות שוב.");
    }
    const tracked = [...new Set([collection, ...latest.collection_ids])].filter(id => current.includes(id) && !removable.has(id));
    await saveLinkedProductCategories(latest, tracked);
    if (toRemove.length) {
      // Keep the verified destination in place even if only some removals succeed.
      await Promise.allSettled(toRemove.map(id => removeSupplierCollectionMembership(productId, id)));
      for (const delay of [0, 400, 1000, 2200]) {
        if (delay) await pause(delay);
        current = await linkedMemberships(productId);
        if (current.includes(collection) && !toRemove.some(id => current.includes(id))) break;
      }
    }
    if (!current.includes(collection) || toRemove.some(id => current.includes(id)))
      throw new Error("השינוי ב־Shopify טרם הושלם. אפשר לנסות שוב.");
    await markSupplierCategoryReviewed(productId, collection);
    return current;
  });
}

export async function assignSupplierCategories(
  site: Site, products: Map<string, string>, collection: string, mode: CategoryAssignmentMode,
  options: SupplierCollectionOption[],
): Promise<CategoryAssignmentResult> {
  const assignable = options.filter(option => option.manual && option.published && option.paths.length);
  if (!assignable.some(option => option.id === collection)) throw new Error("בחרו קטגוריה זמינה לשיוך מתוך קטגוריות האתר.");
  const removable = new Set(mode === "replace" ? assignable.flatMap(option => option.id === collection ? [] : [option.id]) : []);
  const manual = new Set(options.filter(option => option.manual).map(option => option.id));
  const entries = [...products];
  const assigned: CategoryAssignmentResult["assigned"] = [];
  const failed: CategoryAssignmentResult["failed"] = [];
  let linked = false;
  try {
    for (let start = 0; start < entries.length; start += 3) {
      const batch = entries.slice(start, start + 3);
      const results = await Promise.allSettled(batch.map(async ([id, revision]) => {
        const row = await getPreview(site.domain, id);
        if (!row || row.revision !== revision || row.scan_error || row.review_state === "ignored")
          throw new Error("נתוני המוצר השתנו. רעננו את הדוח ובחרו שוב.");
        let current: string[];
        if (row.shopify_product_id) {
          linked = true;
          current = await updateLinkedCategory(site, row, collection, removable);
        } else {
          const original = row.collection_ids.length ? row.collection_ids : mappedCollections(row.category_ids, site);
          current = [...new Set([collection, ...original.filter(id => manual.has(id) && !removable.has(id))])];
          await saveProductCategory(row, current);
        }
        return { id, current: storefrontCategoryLabels(options, current) };
      }));
      results.forEach((result, index) => {
        if (result.status === "fulfilled") assigned.push(result.value);
        else failed.push({ id: batch[index][0], message: result.reason instanceof Error ? result.reason.message : "שמירת השיוך נכשלה." });
      });
    }
    return { assigned, failed };
  } finally {
    if (linked) revalidateTag("shop-catalog");
  }
}

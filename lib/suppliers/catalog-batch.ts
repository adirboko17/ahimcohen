import "server-only";
import { catalogPageSize, catalogPrice, descendants, pricedProduct, type CatalogBatch, type CatalogItem, type Site } from "./catalog-model";
import { countCatalogPreviews, previews, type Preview } from "./storage";
import { catalogPublicationStates } from "./publication";
import { importStatuses } from "./import-queue";
import { detectSupplierBrand, supplierBrandName, supplierDefaultBrand } from "./brand";

export function prices(row: Preview, site: Site) {
  if (row.draft_snapshot && row.shopify_product_id) return row.draft_snapshot.variants;
  if (row.snapshot.currency && row.snapshot.currency !== "ILS" && row.manual_price === null) return [];
  return pricedProduct(row.snapshot, site.percent, row.manual_price).variants;
}

function catalogCategoryIds(site: Site, cat: string) {
  const ids = cat ? descendants([cat], site.categories) : [];
  if (cat && !ids.length) throw new Error("קטגוריה לא מוכרת.");
  return ids;
}

export function readCatalogCount(site: Site, cat: string) {
  return countCatalogPreviews(site.domain, catalogCategoryIds(site, cat));
}

export async function readCatalogBatch(site: Site, cat: string, page: number, importedOnly = false,
  defaultBrand = supplierDefaultBrand(site.domain)): Promise<CatalogBatch> {
  const domain = site.domain;
  const cats = catalogCategoryIds(site, cat);
  const rows = await previews(domain, {
    ...(importedOnly ? { shopify_product_id: "not.is.null" } : { review_state: "eq.known" }),
    limit: String(catalogPageSize + 1),
    offset: String((page - 1) * catalogPageSize),
    order: "snapshot->>category.asc,source_id.asc",
    ...(cat ? { category_ids: "ov.{" + cats.join(",") + "}" } : {}),
  });
  const visible = rows.slice(0,catalogPageSize);
  const [jobs, channels] = await Promise.all([
    importStatuses(domain,visible.map(row => row.source_id)),
    catalogPublicationStates(visible.flatMap(row => row.shopify_product_id ? [row.shopify_product_id] : [])),
  ]);
  const items: CatalogItem[] = visible.map((row) => {
    const p = row.snapshot,
      source = p.variants.map((v) => catalogPrice(v.price, v.regular)),
      final = prices(row, site).map((v) => v.price),
      job = jobs.find((j) => j.source_id === row.source_id);
    const channel = channels.find(c => c.id === row.shopify_product_id);
    const storedBrand = row.shopify_product_id ? supplierBrandName(channel?.vendor ?? row.draft_snapshot?.brand) : "";
    return {
      id: p.id,
      title: p.title,
      brand: row.shopify_product_id ? { name: storedBrand, evidence: storedBrand ? "source" : "missing" } : detectSupplierBrand(p, defaultBrand),
      image: p.images[0],
      categories: row.category_ids,
      variants: p.variants.length,
      available: p.variants.filter((v) => v.available).length,
      images: p.images.length,
      currency: p.currency || "ILS",
      sourceMin: Math.min(...source),
      sourceMax: Math.max(...source),
      finalMin: final.length ? Math.min(...final) : null,
      finalMax: final.length ? Math.max(...final) : null,
      manual: row.manual_price,
      linked: !!row.shopify_product_id,
      shopifyStatus: channel?.status,
      siteUrl: channel?.status === "ACTIVE" && channel.onSite ? "/p/" + encodeURIComponent(channel.handle) : undefined,
      canPublish: row.review_state !== "ignored" &&
        (!row.shopify_product_id || !!channel && (channel.status === "DRAFT" || channel.status === "ACTIVE" && !channel.onSite)),
      intent: job?.intent,
      scanError: row.scan_error,
      revision: row.revision,
      task: job?.state,
      error: job?.error,
    };
  });
  return { items, more: rows.length > catalogPageSize };
}

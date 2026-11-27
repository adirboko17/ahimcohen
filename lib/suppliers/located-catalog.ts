import "server-only";
import { catalogPageSize, descendants, type LocatedCatalogBatch, type ShopifyIndex, type Site } from "./catalog-model";
import { previews, shopFilter, supplierRequest } from "./storage";

const indexedCatalogs = new Map<string, { run: string; index: ShopifyIndex }>();

export function showLocatedCatalog(site: Pick<Site, "state" | "phase" | "platform" | "run_kind">) {
  return site.platform === "shopify" && site.run_kind === "pull" && (site.phase === "index" || site.phase === "catalog") &&
    (site.state === "running" || site.state === "queued");
}

function readableHandle(handle: string) {
  try { return decodeURIComponent(handle).replace(/-+/g, " ").trim(); }
  catch { return handle.replace(/-+/g, " ").trim(); }
}

export async function readLocatedCatalogBatch(site: Site, category: string, page: number): Promise<LocatedCatalogBatch> {
  if (!showLocatedCatalog(site)) {
    indexedCatalogs.delete(site.domain);
    return { items: [], more: false };
  }
  // The completed index stays fixed while product details are being saved.
  const cached = indexedCatalogs.get(site.domain);
  const [staging] = cached && cached.run === site.pull_started_at && site.phase === "catalog" ?
    [{ source_index: cached.index, phase: site.phase, pull_checked: site.pull_checked }] :
    await supplierRequest<Pick<Site, "source_index" | "phase" | "pull_checked">>("ahim_supplier_sites", "GET", {
    ...shopFilter(), domain: "eq." + site.domain, removed_at: "is.null", state: "in.(queued,running)",
    ...(site.pull_started_at ? { pull_started_at: "eq." + site.pull_started_at } : {}),
    select: "source_index,phase,pull_checked", limit: "1",
  });
  if (!staging?.source_index) return { items: [], more: false };

  const index = staging.source_index;
  if (staging.phase === "catalog" && site.pull_started_at && cached?.run !== site.pull_started_at) {
    indexedCatalogs.set(site.domain, { run: site.pull_started_at, index });
    if (indexedCatalogs.size > 8) indexedCatalogs.delete(indexedCatalogs.keys().next().value!);
  }
  const selected = category ? new Set(descendants([category], site.categories)) : null;
  const ids = Object.keys(index).sort().slice(staging.phase === "catalog" ? staging.pull_checked : 0)
    .filter(id => !selected || index[id].categories.some(cat => selected.has(cat)));
  const offset = (page - 1) * catalogPageSize;
  const batch = ids.slice(offset, offset + catalogPageSize);
  const saved = new Set(batch.length ? (await previews(site.domain, {
    source_id: `in.(${batch.join(",")})`, select: "source_id",
  })).map(product => product.source_id) : []);
  return { items: batch.filter(id => !saved.has(id)).map(id => {
    const entry = index[id];
    return { id, title: entry.title || readableHandle(entry.handle), image: entry.image, categories: entry.categories };
  }), more: offset + catalogPageSize < ids.length };
}

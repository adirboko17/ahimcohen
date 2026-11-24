import "server-only";
import { processNextImport } from "./import-queue";
import { randomUUID } from "node:crypto";
import { revalidateTag } from "next/cache";
import { shopDomain } from "@/lib/shopify/config";
import { catalogPageSize, descendants, monitorIntervals, type Site } from "./catalog-model";
import { canonicalDomain, sourceReader } from "./public-source";
import { catalogPage, discoverCategories, readWooProduct, wooThumbnail } from "./woocommerce";
import { discoverShopify, indexShopifyPage, readShopifyProduct } from "./shopify-source";
import { markScanError, previews, savePreview, shopFilter, supplierRequest } from "./storage";

const sitesTable = "ahim_supplier_sites";
// The staging index is only needed by the worker. Keep it out of admin responses and client props.
const publicColumns = "domain,removed_at,platform,currency,monitor_hours,next_monitor_at,last_monitor_ok,baseline_at,run_kind,phase,linked_cursor,index_group,index_page,categories,mappings,selection,pull_all,percent,state,cursor_page,page_count,pulled,pull_started_at,pull_sampled_at,pull_checked,pull_total,issues,last_error,discovered_at,finished_at,lease_until,attempts";
const where = (domain: string) => ({ ...shopFilter(), domain: "eq." + domain, removed_at: "is.null" });
export function listSites() {
  return supplierRequest<Site>(sitesTable, "GET", { ...shopFilter(), select: publicColumns, removed_at: "is.null", order: "domain" });
}
export async function getSite(domain: string) {
  const [site] = await supplierRequest<Site>(sitesTable, "GET", { ...where(domain), select: publicColumns });
  if (!site) throw new Error("האתר אינו ברשימת הספקים.");
  return site;
}
async function updateSite(
  domain: string,
  values: Partial<Site> & { lease?: string | null },
  filters: Record<string, string> = {},
) {
  return supplierRequest<Site>(sitesTable, "PATCH", { ...where(domain), ...filters }, values);
}
const message = (e: unknown) => (e instanceof Error ? e.message : "קריאת הספק נכשלה.");
const retryAt = (e: unknown) => e instanceof Error && "retryAt" in e && typeof e.retryAt === "string" ? e.retryAt : null;
export async function discoverSite(input: string) {
  const domain = await canonicalDomain(input);
  await supplierRequest(
    sitesTable,
    "POST",
    { on_conflict: "shop_domain,domain" },
    { shop_domain: shopDomain(), domain, removed_at: null },
    "resolution=merge-duplicates,return=representation",
  );
  try {
    let source: Pick<Site,"categories"|"platform"|"currency">;
    try {
      source = { categories: await discoverCategories(domain), platform: "woo", currency: null };
    } catch (e) {
      if (retryAt(e)) throw e;
      source = await discoverShopify(await sourceReader(domain));
    }
    const saved = await updateSite(domain, { ...source, discovered_at: new Date().toISOString(), last_error: null },
      { state: "not.in.(queued,running)" });
    if (!saved.length) throw new Error("רשימת האוספים תוכל להתעדכן בסיום המשיכה.");
    return domain;
  } catch (e) {
    await updateSite(domain, { last_error: message(e) });
    throw e;
  }
}
export async function removeSite(domain: string) {
  await updateSite(domain, { removed_at: new Date().toISOString(), state: "idle", monitor_hours: 0, source_index: {}, lease: null, lease_until: null });
}
export async function scheduleMonitor(site: Site, hours: number) {
  if (!monitorIntervals.some(n => n === hours) || (hours > 0 && !site.baseline_at))
    throw new Error("יש להשלים משיכת בסיס תקינה ולבחור תדירות מהרשימה.");
  if (!hours && site.run_kind === "monitor") {
    await updateSite(site.domain, { monitor_hours: 0, state: "idle", lease: null, lease_until: null, source_index: {} },
      { run_kind: "eq.monitor", state: "in.(queued,running)" });
  }
  await updateSite(site.domain, { monitor_hours: hours });
}
export async function queuePull(site: Site, all: boolean, ids: string[], mappings: Record<string, string[]>) {
  if (!site.discovered_at || (!all && !ids.length) || ids.some((id) => !site.categories.some((c) => c.id === id)))
    throw new Error("בחרו קטגוריות תקינות למשיכה.");
  const rows = await updateSite(
    site.domain,
    {
      pull_all: all,
      selection: ids,
      mappings,
      state: "queued",
      run_kind: "pull", phase: site.platform === "shopify" ? "index" : "catalog",
      source_index: {}, index_group: 0, index_page: 1, linked_cursor: "",
      baseline_at: null,
      cursor_page: 1,
      page_count: 0,
      pulled: 0,
      pull_checked: 0,
      pull_total: null,
      pull_started_at: new Date().toISOString(),
      pull_sampled_at: null,
      issues: [],
      last_error: null,
      finished_at: null,
      attempts: 0,
      lease: null,
      lease_until: null,
    },
    { state: "not.in.(queued,running)" },
  );
  if (!rows.length) throw new Error("כבר מתבצעת משיכת קטלוג.");
}
export async function saveMappings(site: Site, mappings: Record<string, string[]>) {
  const rows = await updateSite(site.domain, { mappings }, { discovered_at: "eq." + site.discovered_at });
  if (!rows.length) throw new Error("רשימת הקטגוריות השתנתה. רעננו את המסך.");
}
export async function setPercent(domain: string, percent: number) {
  if (!Number.isFinite(percent) || percent < -100) throw new Error("אחוז שינוי לא תקין.");
  await updateSite(domain, { percent });
}
async function runPage(domain: string, onStockApplied: () => void) {
  const token = randomUUID();
  const lease = () => new Date(Date.now() + 180000).toISOString();
  const [site] = await updateSite(
    domain,
    { state: "running", lease: token, lease_until: lease() },
    {
      state: "in.(queued,running)",
      or: `(lease_until.is.null,lease_until.lt.${new Date().toISOString()})`,
    },
  );
  if (!site) return false;
  const owned = { lease: "eq." + token };
  try {
    if (site.phase === "linked") {
      const linked = await previews(domain, { shopify_product_id: "not.is.null", order: "source_id", limit: "4",
        ...(site.linked_cursor ? { source_id: "gt." + site.linked_cursor } : {}) });
      const issues = [...site.issues];
      for (const row of linked) {
        if (!(await updateSite(domain, { lease_until: lease() }, { ...owned, select:"domain" })).length) return false;
        try {
          const { refreshLinkedProduct } = await import("./publication");
          await refreshLinkedProduct(row, false, site.run_kind === "monitor" ? onStockApplied : undefined);
        } catch (e) {
          if (retryAt(e)) throw e;
          if (!site.excluded_ids?.includes(row.source_id))
            issues.push({ id: row.source_id, title: row.snapshot.title, image: row.snapshot.images[0], message: message(e) });
        }
        if (!(await updateSite(domain, { linked_cursor: row.source_id, issues }, { ...owned, select:"domain" })).length) return false;
      }
      await updateSite(domain, { state:"queued", phase: linked.length === 4 ? "linked" : site.platform === "shopify" ? "index" : "catalog",
        lease:null, lease_until:null, attempts:0 }, owned);
      return true;
    }
    const read = await sourceReader(domain);
    if (site.phase === "index") {
      for (let i=0; i<6; i++) {
        const next = await indexShopifyPage(read, site);
        const release = next.phase === "catalog" || i === 5;
        const saved = await updateSite(domain, { ...next, attempts:0, last_error:null,
          ...(release ? { state:"queued", lease:null, lease_until:null } : { lease_until:lease() }) },
          { ...owned, select:"domain" });
        if (!saved.length || release) break;
        Object.assign(site,next);
      }
      return true;
    }
    const selected = new Set(descendants(site.selection, site.categories));
    const offset = (site.cursor_page - 1) * catalogPageSize;
    async function sourcePage() {
      if (site.platform === "shopify") {
        const index = site.source_index || {};
        const ids = Object.keys(index).sort();
        const products = ids.slice(offset,offset + catalogPageSize).map(id => {
          const entry = index[id];
          return { id, name: entry.handle, image: entry.image, read: () => readShopifyProduct(read, domain, id, site.currency!,
            site.categories.filter(c => entry.categories.includes(c.id))) };
        });
        return { products, total: ids.length, pages: Math.ceil(ids.length / catalogPageSize), more: offset + products.length < ids.length };
      }
      const woo = await catalogPage(read, site.cursor_page, site.pull_all ? [] : [...selected]);
      return { ...woo, products: woo.products.map(p => ({ id:String(p.id), name:p.name, image: wooThumbnail(p, domain),
        read: site.pull_all || p.categories.some(c => selected.has(String(c.id))) ? () => readWooProduct(read, domain, p) : null })) };
    }
    const page = await sourcePage();
    // Legacy pulls already in flight can report counts immediately, but have no reliable start time.
    const sampled = (checked: number) => ({
      pull_checked: Math.max(site.pull_checked, checked),
      pull_sampled_at: new Date().toISOString(),
    });
    let pulled = site.pulled;
    const issues = [...site.issues];
    for (const [index, p] of page.products.entries()) {
      const progress = { ...sampled(offset + index), lease_until: lease(), page_count: page.pages, pull_total: page.total };
      if (!(await updateSite(domain, progress, { ...owned, select: "domain" })).length) return false;
      if (!p.read || site.excluded_ids?.includes(p.id)) continue;
      let snapshot;
      try {
        snapshot = await p.read();
      } catch (first) {
        if (retryAt(first)) throw first;
        try {
          snapshot = await p.read();
        } catch (e) {
          if (retryAt(e)) throw e;
          await markScanError(domain, String(p.id), message(e));
          issues.push({ id: String(p.id), title: p.name, image: p.image, message: message(e), categories: site.source_index?.[p.id]?.categories });
          continue;
        }
      }
      await savePreview(snapshot, site.run_kind === "monitor" && !site.baseline_exceptions?.includes(p.id));
      pulled++;
    }
    await updateSite(
      domain,
      {
        state: page.more ? "queued" : "complete",
        cursor_page: site.cursor_page + 1,
        ...sampled(offset + page.products.length),
        pull_total: page.total,
        page_count: page.pages,
        pulled,
        issues,
        lease: null,
        lease_until: null,
        attempts: 0,
        last_error: null,
        finished_at: page.more ? null : new Date().toISOString(),
        ...(page.more ? {} : { source_index: {} }),
      },
      owned,
    );
    return page.more;
  } catch (e) {
    const attempts = site.attempts + 1;
    await updateSite(
      domain,
      {
        state: attempts < 3 ? "queued" : "failed",
        attempts,
        last_error: message(e),
        lease: null,
        lease_until: attempts < 3 ? retryAt(e) ?? new Date(Date.now() + attempts * 10000).toISOString() : null,
      },
      owned,
    );
    return false;
  }
}
// Each page is a durable checkpoint. Another server can resume an expired lease.
export async function processCatalogJobs() {
  const due = await supplierRequest<Pick<Site, "domain">>(sitesTable, "GET", {
    ...shopFilter(),
    select: "domain",
    removed_at: "is.null",
    state: "in.(queued,running)",
    or: `(lease_until.is.null,lease_until.lt.${new Date().toISOString()})`,
    order: "domain",
  });
  let stockApplied = false;
  try {
    await processNextImport();
    for (const site of due) await runPage(site.domain, () => { stockApplied = true; });
  } finally {
    if (stockApplied) revalidateTag("shop-catalog");
  }
}
let active: Promise<void> | undefined;
export function wakeCatalogWorker() {
  active ??= processCatalogJobs().finally(() => {
    active = undefined;
  });
  return active;
}

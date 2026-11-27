import type { SupplierProduct } from "./redback";
import type { SupplierBrand } from "./brand";

const publicHost = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]+$/i;

// Product photos may live on the shop itself or on any public CDN the shop uses.
export function publicMediaUrl(value: string, base?: string) {
  let url: URL;
  try {
    url = new URL(value, base);
  } catch {
    throw new Error("כתובת התמונה אינה תקינה.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !publicHost.test(url.hostname) ||
    /\.(localhost|local|internal)$/i.test(url.hostname)
  )
    throw new Error("כתובת התמונה אינה ציבורית.");
  return url.href;
}

export type SourceCategory = { id: string; parent: string; name: string; count: number; handle?: string };
export type ShopifyIndex = Record<string, { handle: string; title?: string; categories: string[]; image?: string }>;
export const monitorIntervals = [0, 24] as const;
export function formatMonitorCountdown(seconds: number) {
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map(part => String(part).padStart(2, "0"))
    .join(":");
}
export type Site = {
  domain: string;
  platform: "woo" | "shopify";
  currency: string | null;
  monitor_hours: number;
  next_monitor_at: string | null;
  last_monitor_ok: string | null;
  baseline_at: string | null;
  baseline_exceptions?: string[];
  excluded_ids?: string[];
  run_kind: "pull" | "monitor";
  phase: "linked" | "index" | "catalog";
  linked_cursor: string;
  index_group: number;
  index_page: number;
  source_cursor: string | null;
  source_index?: ShopifyIndex;
  removed_at: string | null;
  categories: SourceCategory[];
  mappings: Record<string, string[]>;
  selection: string[];
  pull_all: boolean;
  percent: number;
  state: "idle" | "queued" | "running" | "complete" | "failed";
  cursor_page: number;
  page_count: number;
  pulled: number;
  pull_started_at: string | null;
  pull_sampled_at: string | null;
  pull_checked: number;
  pull_total: number | null;
  issues: { id: string; title: string; message: string; categories?: string[]; image?: string }[];
  last_error: string | null;
  discovered_at: string | null;
  finished_at: string | null;
  lease_until: string | null;
  attempts: number;
};
export const catalogPageSize = 12;
export type PullSample = { checked: number; sampledAt: number };

function remainingSeconds(checked: number, remaining: number, elapsed: number) {
  return checked >= 2 && remaining > 0 && elapsed > 0 ? Math.ceil(elapsed * remaining / checked / 1000) : null;
}

export function pullProgress(site: Pick<Site, "state" | "page_count" | "pull_started_at" | "pull_sampled_at" | "pull_checked" | "pull_total">,
  baseline?: PullSample | null) {
  const checked = site.pull_checked;
  const total = site.pull_total ?? site.page_count * catalogPageSize;
  const elapsed = Date.parse(site.pull_sampled_at || "") - (baseline?.sampledAt ?? Date.parse(site.pull_started_at || ""));
  const complete = site.state === "complete";
  const percent = complete ? 100 : total ? Math.min(99, Math.floor(100 * checked / total)) : null;
  const secondsLeft = complete || baseline === null ? null : remainingSeconds(checked - (baseline?.checked ?? 0), total - checked, elapsed);
  return { percent, secondsLeft };
}

export function indexCollectionTotal(site: Pick<Site, "pull_all" | "categories" | "selection">) {
  return site.pull_all ? site.categories.length : site.categories.filter(category => site.selection.includes(category.id)).length;
}

export function indexCollectionProgress(site: Pick<Site, "pull_all" | "index_group" | "pull_started_at" | "pull_sampled_at">,
  total: number, observedAt: number) {
  // A nonzero group in a full pull is a legacy run iterating collections after listing products.
  if (!total || (site.pull_all && site.index_group === 0)) return null;
  const checked = Math.min(total, Math.max(0, site.index_group - (site.pull_all ? 1 : 0)));
  const elapsed = (Date.parse(site.pull_sampled_at || "") || observedAt) - Date.parse(site.pull_started_at || "");
  return { checked, total, secondsLeft: remainingSeconds(checked, total - checked, elapsed) };
}
export const supplierKey = (domain: string) => (domain === "redback.co.il" ? "redback" : domain);
export const productDomain = (p: SupplierProduct) => p.domain || "redback.co.il";
export const productBrand = (p: SupplierProduct) => p.brand ?? (!p.domain ? "Redback" : "");

export function categoryPath(id: string, categories: SourceCategory[]) {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const path: SourceCategory[] = [];
  let current = byId.get(id);
  while (current && !path.some((c) => c.id === current!.id)) {
    path.unshift(current);
    current = byId.get(current.parent);
  }
  return path;
}
export function descendants(ids: string[], categories: SourceCategory[]) {
  const selected = new Set(ids);
  return categories
    .filter((c) => categoryPath(c.id, categories).some((parent) => selected.has(parent.id)))
    .map((c) => c.id);
}
export function mappedCollections(ids: string[], site: Pick<Site, "categories" | "mappings">) {
  const mapped = ids
    .flatMap((id) =>
      categoryPath(id, site.categories)
        .reverse()
        .find((c) => site.mappings[c.id]?.length),
    )
    .flatMap((c) => (c ? site.mappings[c.id] : []));
  return [...new Set(mapped)];
}
export function catalogPrice(current: number, regular: number) {
  return regular > current ? regular : current;
}
export function pricedProduct(p: SupplierProduct, percent: number, manual: number | null): SupplierProduct {
  if (!Number.isFinite(percent) || percent < -100 || (manual !== null && (!Number.isFinite(manual) || manual < 0)))
    throw new Error("המחיר או האחוז אינם תקינים.");
  if (p.currency && p.currency !== "ILS" && manual === null)
    throw new Error("מחיר המקור במטבע אחר. יש לקבוע מחיר ידני בש״ח.");
  const adjust = (n: number) => Math.round(n * (100 + percent)) / 100;
  return {
    ...p,
    variants: p.variants.map((v) => {
      const original = adjust(catalogPrice(v.price, v.regular));
      return { ...v, price: manual ?? original, regular: manual ?? original };
    }),
  };
}
export function supplierUrl(domain?: string, view?: string, extra: Record<string, string> = {}) {
  const q = new URLSearchParams({
    tab: "suppliers",
    ...(domain ? { site: domain } : {}),
    ...(view ? { view } : {}),
    ...extra,
  });
  return "/admin?" + q.toString();
}

export type CatalogItem = {
  id: string;
  title: string;
  brand?: SupplierBrand;
  image: string;
  categories: string[];
  variants: number;
  available: number;
  images: number;
  currency: string;
  sourceMin: number;
  sourceMax: number;
  finalMin: number | null;
  finalMax: number | null;
  manual: number | null;
  linked: boolean;
  shopifyStatus?: string;
  siteUrl?: string;
  canPublish: boolean;
  intent?: "draft" | "publish";
  scanError: string | null;
  revision: string;
  task?: string;
  error?: string | null;
};

export type CatalogBatch = { items: CatalogItem[]; more: boolean };
export type LocatedProduct = { id: string; title: string; image?: string; categories: string[] };
export type LocatedCatalogBatch = { items: LocatedProduct[]; more: boolean };

export type StockChange = {
  variantId: string;
  options: Record<string, string>;
  before: boolean | null;
  after: boolean;
  siteAvailable: boolean;
};

export type MonitorReport =
  | { kind: "stock"; more: boolean; items: { id: string; title: string; handle: string; applied_at: string; changes: StockChange[] }[] }
  | { kind: "new"; more: boolean; total: number; items: {
    id: string; title: string; category: string; image: string | null;
    brand?: SupplierBrand;
    task?: "queued" | "running" | "done" | "failed"; error?: string | null;
  }[] };

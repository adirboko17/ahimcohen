import type { SupplierProduct } from "./redback";

export type SourceCategory = { id: string; parent: string; name: string; count: number; handle?: string };
export type ShopifyIndex = Record<string, { handle: string; categories: string[]; image?: string }>;
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
export function pullProgress(site: Pick<Site, "state" | "page_count" | "pull_started_at" | "pull_sampled_at" | "pull_checked" | "pull_total">) {
  const checked = site.pull_checked;
  const total = site.pull_total ?? site.page_count * catalogPageSize;
  const elapsed = Date.parse(site.pull_sampled_at || "") - Date.parse(site.pull_started_at || "");
  const complete = site.state === "complete";
  const percent = complete ? 100 : total ? Math.min(99, Math.floor(100 * checked / total)) : null;
  const secondsLeft = !complete && total && checked >= 2 && checked < total && elapsed > 0
    ? Math.ceil((elapsed / checked) * (total - checked) / 1000)
    : null;
  return { percent, secondsLeft };
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
export function suggestedMapping(category: string, collections: { id: string; title: string }[]) {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/['"״׳]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const name = normalize(category);
  const found =
    collections.find((c) => normalize(c.title) === name) ??
    collections
      .filter((c) => normalize(c.title).length >= 4 && name.includes(normalize(c.title)))
      .sort((a, b) => b.title.length - a.title.length)[0];
  return found ? [found.id] : [];
}
export function pricedProduct(p: SupplierProduct, percent: number, manual: number | null): SupplierProduct {
  if (!Number.isFinite(percent) || percent < -100 || (manual !== null && (!Number.isFinite(manual) || manual < 0)))
    throw new Error("המחיר או האחוז אינם תקינים.");
  if (p.currency && p.currency !== "ILS" && manual === null)
    throw new Error("מחיר המקור במטבע אחר. יש לקבוע מחיר ידני בש״ח.");
  const adjust = (n: number) => Math.round(n * (100 + percent)) / 100;
  return {
    ...p,
    variants: p.variants.map((v) => ({
      ...v,
      price: manual ?? adjust(v.price),
      regular: manual ?? adjust(v.regular),
    })),
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
    task?: "queued" | "running" | "done" | "failed"; error?: string | null;
  }[] };

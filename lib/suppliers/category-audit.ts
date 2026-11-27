import "server-only";
import { unstable_cache } from "next/cache";
import { CATS } from "@/lib/catalog";
import { shopDomain } from "@/lib/shopify/config";
import { supplierKey, type Site } from "./catalog-model";
import { canonicalCategoryLabel, categoryNames, categoryText, productSupportsCategory, supplierCategoryLabel } from "./category-matching";
import { shopFilter, supplierRequest } from "./storage";

export const categoryOpportunityMinimum = 15;
type CategoryEvidence = { source_id: string; title: string; category?: string | null; productType?: string | null; brand?: string | null };
type CategoryOpportunity = { label: string; ids: string[] };
const knownTypes = new Set(CATS.flatMap(category => [category.name, ...category.subs]).flatMap(categoryNames));
const qualifiers = /(?:^| )(?:outlet|sale|new|brands?|models?|עודפים|מארז|אאוטלט|דגמים|קולקציה|נשים|גברים|ילדים)(?: |$)/u;

export function categoryOpportunities(products: CategoryEvidence[]): CategoryOpportunity[] {
  const groups = new Map<string, { label: string; ids: Set<string> }>();
  for (const product of products) {
    const labels = [...(product.category ?? "").split("·"), product.productType ?? ""];
    for (const raw of labels) {
      const source = supplierCategoryLabel(raw, undefined, product.brand ?? undefined);
      if (!source || source.length > 65) continue;
      const sourceLabel = canonicalCategoryLabel(source);
      const materialLabel = /^(?:דריי? ?פיט|dri ?fit|dry ?fit)$/u.test(categoryText(sourceLabel));
      if (materialLabel && !productSupportsCategory("חולצות", product.title)) continue;
      const label = materialLabel ? "חולצות דרייפיט" : sourceLabel;
      const key = categoryText(label);
      if (!key || knownTypes.has(key) || qualifiers.test(key) || /\d/u.test(key) ||
        !productSupportsCategory(sourceLabel, product.title)) continue;
      const group = groups.get(key) ?? { label, ids: new Set<string>() };
      group.ids.add(product.source_id);
      groups.set(key, group);
    }
  }
  const claimed = new Set<string>();
  return [...groups.values()].filter(group => group.ids.size >= categoryOpportunityMinimum)
    .sort((a, b) => b.label.length - a.label.length || b.ids.size - a.ids.size)
    .flatMap(group => {
      const ids = [...group.ids].filter(id => !claimed.has(id));
      if (ids.length < categoryOpportunityMinimum) return [];
      for (const id of ids) claimed.add(id);
      return [{ label: group.label, ids }];
    });
}

const auditPull = unstable_cache(async (_shop: string, supplier: string, run: string) => {
  const evidence: CategoryEvidence[] = [];
  let cursor: string | undefined;
  for (;;) {
    const rows: CategoryEvidence[] = await supplierRequest<CategoryEvidence>("ahim_supplier_previews", "GET", {
      ...shopFilter(), supplier: "eq." + supplier, review_state: "in.(known,pending)",
      scan_error: "is.null", scanned_at: "gte." + run, order: "source_id.asc", limit: "200",
      select: "source_id,title:snapshot->>title,category:snapshot->>category,productType:snapshot->>productType,brand:snapshot->>brand",
      ...(cursor ? { source_id: "gt." + cursor } : {}),
    });
    evidence.push(...rows);
    if (rows.length < 200) return categoryOpportunities(evidence);
    cursor = rows.at(-1)!.source_id;
  }
}, ["supplier-category-opportunities-v1"], { revalidate: 300 });

export function readSupplierCategoryAudit(site: Pick<Site, "domain" | "pull_started_at">) {
  return site.pull_started_at ? auditPull(shopDomain(), supplierKey(site.domain), site.pull_started_at) : Promise.resolve([]);
}

import "server-only";
import { CATS } from "@/lib/catalog";
import { canonicalCategoryLabel, categoryNames, categoryText, productSupportsCategory, supplierCategoryLabel } from "./category-matching";

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

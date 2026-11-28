import { productSubcategories, type Category, type Product } from "./catalog";
import { hasStorefrontSubcategoryChanges, storefrontSubcategory, storefrontSubcategoryLabelsFor, storefrontSubcategoryParent } from "./category-placement";

export type CategoryPath = { parentId: string; sub: string };
export type CategoryAdjustment = { added: CategoryPath[]; removed: CategoryPath[] };
export type CategorySources = Record<string, { id: string; direct: string[] }>;
export type CategoryEditSummary = { id: string; count: number; mode: "move" | "add" };
export type CategoryEditCommand =
  | { operation: "undo"; id: string }
  | { operation: "move" | "add"; id: string; source: CategoryPath; target: CategoryPath; products: string[] };
export type CategoryEditResponse =
  | { ok: true; count: number; lastEdit: CategoryEditSummary | null }
  | { ok: false; message: string; lastEdit?: CategoryEditSummary | null };

export const categoryBatchLimit = 250;
export const categoryPathKey = ({ parentId, sub }: CategoryPath) => JSON.stringify([storefrontSubcategoryParent(parentId, sub), sub]);

export function productCategoryPaths(product: Product, direct?: string[]): CategoryPath[] {
  return (product.cats ?? [product.cat]).filter(parentId => parentId && parentId !== "shop").flatMap(parentId => {
    const subs = productSubcategories(product, parentId).filter(Boolean);
    const paths = subs.map(sub => ({ parentId: storefrontSubcategoryParent(parentId, sub), sub }));
    if (!subs.length || direct?.includes(parentId)) paths.unshift({ parentId, sub: "" });
    return paths;
  });
}

export function adjustedCategoryPaths(paths: CategoryPath[], adjustment?: CategoryAdjustment) {
  if (!adjustment) return paths;
  const current = new Map(paths.map(path => [categoryPathKey(path), path]));
  for (const path of adjustment.removed) current.delete(categoryPathKey(path));
  for (const path of adjustment.added) current.set(categoryPathKey(path), { ...path, parentId: storefrontSubcategoryParent(path.parentId, path.sub) });
  return [...current.values()];
}

export function categoryAdjustment(
  previous: CategoryAdjustment | undefined, paths: CategoryPath[], target: CategoryPath,
): CategoryAdjustment {
  const added = new Map(previous?.added.map(path => [categoryPathKey(path), path]));
  const removed = new Map(previous?.removed.map(path => [categoryPathKey(path), path]));
  const targetKey = categoryPathKey(target);
  for (const path of paths) {
    for (const label of storefrontSubcategoryLabelsFor(path.parentId, path.sub)) {
      const origin = { parentId: path.parentId, sub: label };
      const key = categoryPathKey(origin);
      if (key === targetKey) continue;
      added.delete(key);
      removed.set(key, origin);
    }
  }
  removed.delete(targetKey);
  added.set(targetKey, target);
  return { added: [...added.values()], removed: [...removed.values()] };
}

export function applyCategoryAdjustments(
  products: Product[], categories: Category[], taxonomy: Category[], sources: CategorySources,
  adjustments: Record<string, CategoryAdjustment>,
) {
  const allowed = new Map(taxonomy.map(category => [category.id, new Set(category.subs)]));
  // Keep the original tabs available when the last product is moved out.
  const shown = new Map(categories.map(category => [category.id,
    new Set(category.subs.map(sub => storefrontSubcategory(category.id, sub))),
  ]));
  const adjusted = products.map(product => {
    const source = Object.hasOwn(sources, product.id) ? sources[product.id] : undefined;
    const adjustment = source && adjustments[source.id];
    const hasLegacySub = (product.cats ?? [product.cat]).some(parentId => hasStorefrontSubcategoryChanges(parentId) &&
      productSubcategories(product, parentId).some(sub => storefrontSubcategory(parentId, sub) !== sub || storefrontSubcategoryParent(parentId, sub) !== parentId));
    if (!adjustment && !hasLegacySub) return product;
    const byParent = new Map<string, string[]>();
    const originalSubcategories = new Set<string>();
    const paths = adjustedCategoryPaths(productCategoryPaths(product, source?.direct), adjustment);
    for (const { parentId, sub: originalSub } of paths) {
      const sub = storefrontSubcategory(parentId, originalSub);
      const known = allowed.get(parentId);
      if (!known || (sub && !known.has(sub))) continue;
      if (sub !== originalSub) originalSubcategories.add(originalSub);
      const subs = byParent.get(parentId) ?? [];
      const visible = shown.get(parentId) ?? new Set<string>();
      if (sub && !subs.includes(sub)) {
        subs.push(sub);
        visible.add(sub);
      }
      byParent.set(parentId, subs);
      shown.set(parentId, visible);
    }
    const cats = [...byParent.keys()];
    const subs = [...new Set([...byParent.values()].flat())];
    return {
      ...product, cat: cats[0] ?? "shop", cats, sub: subs[0] ?? "", subs,
      categorySubs: Object.fromEntries(byParent),
      ...(originalSubcategories.size && { originalSubcategories: [...originalSubcategories] }),
    };
  });
  const originals = new Map(categories.map(category => [category.id, category]));
  return {
    products: adjusted,
    categories: taxonomy.flatMap(category => {
      const visible = shown.get(category.id);
      return visible ? [{ ...category, image: originals.get(category.id)?.image ?? null, subs: category.subs.filter(sub => visible.has(sub)) }] : [];
    }),
  };
}

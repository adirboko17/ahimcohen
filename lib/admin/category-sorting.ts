import "server-only";
import { CATS } from "@/lib/catalog";
import { storefrontCategories, storefrontSubcategory } from "@/lib/category-placement";
import {
  adjustedCategoryPaths, categoryAdjustment, categoryPathKey, productCategoryPaths,
  type CategoryEditCommand, type CategoryEditSummary,
} from "@/lib/category-sorting";
import { loadShopCatalog } from "@/lib/shopify/load-catalog";
import type { AdminStore } from "./models";
import { changeAdminStore } from "./storage";

export class CategoryEditConflict extends Error {
  constructor(message: string, public lastEdit?: CategoryEditSummary | null) {
    super(message);
  }
}

export function categorySortOptions(store: AdminStore) {
  return storefrontCategories(CATS, store.categoryPlacements);
}

export function lastCategoryEdit(store: AdminStore): CategoryEditSummary | null {
  const last = store.lastCategoryEdit;
  return last && !last.undone ? { id: last.id, count: last.count, mode: last.mode } : null;
}

export async function editStorefrontCategories(command: CategoryEditCommand) {
  const catalog = command.operation === "undo" ? null : await loadShopCatalog(true);
  let count = 0;
  let lastEdit: CategoryEditSummary | null = null;

  await changeAdminStore(store => {
    const last = store.lastCategoryEdit;
    if (command.operation === "undo") {
      if (!last || last.id !== command.id) {
        throw new CategoryEditConflict("בוצע שינוי חדש יותר. אפשר לבטל את הפעולה האחרונה בלבד.", lastCategoryEdit(store));
      }
      count = last.count;
      if (last.undone) return;
      const restored = { ...store.categoryAdjustments };
      for (const [id, previous] of Object.entries(last.previous)) {
        if (previous) restored[id] = previous;
        else delete restored[id];
      }
      store.categoryAdjustments = restored;
      store.lastCategoryEdit = { ...last, undone: true, previous: {} };
      return;
    }

    if (last?.id === command.id) {
      if (last.undone) throw new CategoryEditConflict("הפעולה הזו כבר בוטלה. בחרו שוב את המוצרים.", null);
      count = last.count;
      lastEdit = lastCategoryEdit(store);
      return;
    }

    const paths = new Set(categorySortOptions(store).flatMap(({ id, subs }) =>
      ["", ...subs].map(sub => categoryPathKey({ parentId: id, sub }))));
    const sourceKey = categoryPathKey(command.source);
    const targetKey = categoryPathKey(command.target);
    if (!paths.has(sourceKey) || !paths.has(targetKey) || sourceKey === targetKey) {
      throw new CategoryEditConflict("בחרו קטגוריית יעד שונה מקטגוריית המקור.");
    }

    const sources = catalog?.categorySources;
    if (!sources) throw new Error("Missing catalog category sources");
    const products = new Map(catalog.products.map(product => [product.id, product]));
    const adjustments = { ...store.categoryAdjustments };
    const previous: NonNullable<AdminStore["lastCategoryEdit"]>["previous"] = {};
    for (const handle of command.products) {
      const product = products.get(handle);
      const source = Object.hasOwn(sources, handle) ? sources[handle] : undefined;
      if (!product || !source) throw new CategoryEditConflict("אחד המוצרים כבר אינו זמין. רעננו את העמוד ובחרו שוב.");
      const adjustment = adjustments[source.id];
      const current = adjustedCategoryPaths(productCategoryPaths(product, source.direct), adjustment);
      const from = current.filter(path => path.parentId === command.source.parentId &&
        (!command.source.sub || storefrontSubcategory(path.parentId, path.sub) === command.source.sub));
      if (!from.length) throw new CategoryEditConflict("שיוך של אחד המוצרים השתנה. רעננו את העמוד ובחרו שוב.");

      previous[source.id] = adjustment ?? null;
      adjustments[source.id] = categoryAdjustment(adjustment, command.operation === "move" ? from : [], command.target);
    }
    count = command.products.length;
    lastEdit = { id: command.id, count, mode: command.operation };
    store.categoryAdjustments = adjustments;
    store.lastCategoryEdit = { ...lastEdit, previous };
  });

  return { ok: true as const, count, lastEdit };
}

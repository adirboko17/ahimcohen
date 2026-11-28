import "server-only";
import { cache } from "react";
import { readAdminStore } from "@/lib/admin/storage";
import { CATS } from "@/lib/catalog";
import { storefrontCategories } from "@/lib/category-placement";
import { applyCategoryAdjustments } from "@/lib/category-sorting";
import { loadShopCatalog } from "./load-catalog";

export const loadStorefrontCatalog = cache(async () => {
  const [catalog, store] = await Promise.all([loadShopCatalog(), readAdminStore()]);
  return applyCategoryAdjustments(catalog.products, catalog.categories, storefrontCategories(CATS, store.categoryPlacements),
    catalog.categorySources ?? {}, store.categoryAdjustments ?? {});
});

export async function storefrontCategoryDefinition(id: string) {
  const store = await readAdminStore();
  return storefrontCategories(CATS, store.categoryPlacements).find(category => category.id === id);
}

import "server-only";
import { readAdminStore } from "@/lib/admin/storage";
import { CATS } from "@/lib/catalog";
import { storefrontCategories } from "@/lib/category-placement";
import { menuPlacements } from "@/lib/shopify/fetch-catalog";
import { sitePublication } from "./publication";
import { supplierCollections } from "./shopify";

export type SupplierCollectionOption = {
  id: string;
  title: string;
  manual: boolean;
  published: boolean;
  paths: { parentId: string; parent: string; sub: string }[];
};

export async function supplierStorefrontCollections(): Promise<SupplierCollectionOption[]> {
  const [collections, store] = await Promise.all([supplierCollections(sitePublication()), readAdminStore()]);
  const placements = menuPlacements(collections.filter(collection => collection.onSite), store.categoryPlacements ?? []);
  const parents = new Map(storefrontCategories(CATS, store.categoryPlacements).map(category => [category.id, category.name]));
  return collections.map(collection => ({
    id: collection.id, title: collection.title, manual: !collection.ruleSet, published: !!collection.onSite,
    paths: (placements.get(collection.handle) ?? []).flatMap(({ parentId, sub }) => {
      const parent = parents.get(parentId);
      return parent ? [{ parentId, parent, sub }] : [];
    }),
  }));
}

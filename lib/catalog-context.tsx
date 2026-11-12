"use client";

import { createContext, useContext, useMemo } from "react";
import { CATS, PRODUCTS, productsInCategory as staticProductsInCategory, type Category, type Product } from "./catalog";

export type CatalogSnapshot = {
  categories: Category[];
  products: Product[];
};

type CatalogView = {
  categories: Category[];
  products: Product[];
  product: (id: string) => Product | undefined;
  category: (id: string) => Category | undefined;
  productsInCategory: (id: string) => Product[];
};

const Ctx = createContext<CatalogView | null>(null);

export function CatalogProvider({ catalog, children }: { catalog: CatalogSnapshot; children: React.ReactNode }) {
  const view = useMemo(() => makeView(catalog.categories, catalog.products, false), [catalog]);
  return <Ctx.Provider value={view}>{children}</Ctx.Provider>;
}

export function useCatalog() {
  return useContext(Ctx) ?? staticView;
}

function makeView(categories: Category[], products: Product[], legacy: boolean): CatalogView {
  const byProduct = Object.fromEntries(products.map((product) => [product.id, product]));
  const byCategory = Object.fromEntries(categories.map((category) => [category.id, category]));
  return {
    categories,
    products,
    product: (id) => byProduct[id],
    category: (id) => byCategory[id],
    productsInCategory: (id) =>
      legacy ? staticProductsInCategory(id) : products.filter((product) => (product.cats ?? [product.cat]).includes(id)),
  };
}

const staticView = makeView(CATS, PRODUCTS, true);

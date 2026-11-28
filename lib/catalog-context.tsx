"use client";

import { createContext, useContext, useMemo } from "react";
import { CATS, PRODUCTS, productsInCategory as staticProductsInCategory, type Category, type Product } from "./catalog";
import { unpackCatalog, type CatalogWire } from "./catalog-wire";
import { canonicalBrandName, catalogBrands, type Brand } from "./brands";
import { emptyColorMappings, type ColorMappings } from "./color-families";

export type CatalogSnapshot = {
  categories: Category[];
  products: Product[];
};

type CatalogView = {
  brands: Brand[];
  brand: (name?: string) => Brand | undefined;
  categories: Category[];
  products: Product[];
  colorMappings: ColorMappings;
  product: (id: string) => Product | undefined;
  category: (id: string) => Category | undefined;
  productsInCategory: (id: string) => Product[];
};

const Ctx = createContext<CatalogView | null>(null);

export function CatalogProvider({ catalog, colorMappings = emptyColorMappings, children }: {
  catalog: CatalogWire; colorMappings?: ColorMappings; children: React.ReactNode;
}) {
  const view = useMemo(() => {
    const snapshot = unpackCatalog(catalog);
    return makeView(snapshot.categories, snapshot.products, false, colorMappings);
  }, [catalog, colorMappings]);
  return <Ctx.Provider value={view}>{children}</Ctx.Provider>;
}

export function useCatalog() {
  return useContext(Ctx) ?? staticView;
}

function makeView(categories: Category[], allProducts: Product[], legacy: boolean, colorMappings = emptyColorMappings): CatalogView {
  const byProduct = Object.fromEntries(allProducts.map((product) => [product.id, product]));
  const products = allProducts.filter((product) => !product.bundleSourceId);
  const byCategory = Object.fromEntries(categories.map((category) => [category.id, category]));
  const brands = catalogBrands(products);
  const byBrand = new Map(brands.map(brand => [brand.name.toLowerCase(), brand]));
  return {
    brands, brand: name => byBrand.get(canonicalBrandName(name)?.toLowerCase() ?? ""),
    categories,
    products,
    colorMappings,
    product: (id) => byProduct[id],
    category: (id) => byCategory[id],
    productsInCategory: (id) =>
      legacy ? staticProductsInCategory(id) : products.filter((product) => (product.cats ?? [product.cat]).includes(id)),
  };
}

const staticView = makeView(CATS, PRODUCTS, true);

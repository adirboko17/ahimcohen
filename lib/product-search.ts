import type { Category, Product } from "./catalog";

export function searchCatalogProducts(products: Product[], category: (id: string) => Category | undefined, query: string) {
  const term = query.trim().toLowerCase();
  if (!term) return [];

  return products.filter((product) => [
    product.name,
    product.sku,
    product.brand,
    category(product.cat)?.name,
    product.sub,
    ...(product.std ?? []),
  ].join(" ").toLowerCase().includes(term));
}

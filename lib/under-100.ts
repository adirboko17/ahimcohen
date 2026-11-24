import type { Product, VariantChoice } from "./catalog";

const featuredIds = [
  "קפוצון-קנגורו",
  "כפפות-קור-ninja-ice",
  "סינר-גינס-אמסטרדם-10-80",
  "מגף-ניטריל-שחור",
  "חולצת-דרייפיט-פולו-פורטו-ללא-כיס",
  "משקפי-מגן-kamba",
  "כובע-מצחייה-דגם-washed",
  "זקט-פליז",
];

export type BudgetItem = { product: Product; choice?: VariantChoice };

export function productsUnder100(products: Product[]) {
  const items: BudgetItem[] = [];
  for (const product of products) {
    let choice: VariantChoice | undefined;
    for (const variant of product.choices ?? []) {
      if (variant.available && variant.price > 0 && variant.price <= 100 && (!choice || variant.price < choice.price)) {
        choice = variant;
      }
    }
    if (product.choices?.length ? !choice : !(product.price > 0 && product.price <= 100)) continue;
    items.push({ product, choice });
  }
  return items;
}

export function featuredUnder100(items: BudgetItem[]) {
  const pictured = items.filter(({ product, choice }) => choice?.image || product.imgs?.[0]);
  const featured = featuredIds.flatMap((id) => pictured.find(({ product }) => product.id === id) ?? []);
  const selected = new Set(featured.map(({ product }) => product.id));
  const remaining = items.filter(({ product }) => !selected.has(product.id));
  const withPhoto = remaining.filter(({ product, choice }) => choice?.image || product.imgs?.[0]);
  const withoutPhoto = remaining.filter(({ product, choice }) => !choice?.image && !product.imgs?.[0]);
  return [...featured, ...withPhoto, ...withoutPhoto].slice(0, 8);
}

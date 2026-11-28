import type { Product, VariantChoice } from "./catalog";

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

export function featuredUnder100(items: BudgetItem[], seed: number) {
  // The server supplies one seed per page load so hydration keeps the same tiles.
  const shuffled = [...items];
  let state = seed;
  for (let end = shuffled.length - 1; end > 0; end--) {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    const index = Math.floor((state / 2 ** 32) * (end + 1));
    [shuffled[end], shuffled[index]] = [shuffled[index], shuffled[end]];
  }

  const picturedCounts = new Map<string, number>();
  const unpicturedCounts = new Map<string, number>();
  const ranked = shuffled.map(item => {
    const { product, choice } = item;
    const pictured = Boolean(choice?.image || product.imgs?.[0]);
    const counts = pictured ? picturedCounts : unpicturedCounts;
    const isHat = product.sub.startsWith("כובע") || /^(?:[^|]+\|\s*)?כובע/.test(product.name.trim());
    const kind = isHat ? "כובעים" : product.sub || product.cat;
    const previous = counts.get(kind) ?? 0;
    counts.set(kind, previous + 1);
    return { item, pictured, previous };
  });
  // Take the first of each kind before its other styles or colors.
  ranked.sort((a, b) => Number(b.pictured) - Number(a.pictured) || a.previous - b.previous);
  return ranked.slice(0, 8).map(({ item }) => item);
}

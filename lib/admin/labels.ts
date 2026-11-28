import { productSubcategories, type Product } from "../catalog";
import type { AdminLabel } from "./models";

const productKey = (id: string) => JSON.stringify(["product", id]);
const categoryKey = (id: string, sub = "") => JSON.stringify(["category", id, sub]);

export function labelTargetKeys(label: AdminLabel): string[] {
  if (label.scope === "all") return ["all"];
  if (label.scope === "categories") return label.paths.map(path => categoryKey(path.parentId, path.sub));
  return [productKey(label.productId)];
}

export function productLabelResolver(labels: AdminLabel[]) {
  const targets = new Map<string, string>();
  const hasCategories = labels.some(label => label.scope === "categories");
  for (const label of labels) {
    for (const key of labelTargetKeys(label)) targets.set(key, label.text);
  }
  return (product: Product) => {
    const direct = targets.get(productKey(product.id));
    if (direct || !hasCategories) return direct ?? targets.get("all");
    let parentLabel;
    for (const id of product.cats ?? [product.cat]) {
      for (const sub of productSubcategories(product, id)) {
        const matched = sub && targets.get(categoryKey(id, sub));
        if (matched) return matched;
      }
      parentLabel ??= targets.get(categoryKey(id));
    }
    return parentLabel ?? targets.get("all");
  };
}

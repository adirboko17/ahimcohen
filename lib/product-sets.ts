import type { Product } from "./catalog";
import { complementaryAccessories } from "./product-recommendations";

export type SetOffer = {
  shopifyId: string;
  price: number;
  variants: { id: string; components: string[] }[];
};
export type ProductSet = {
  id: string;
  revision: string;
  mode: "hidden" | "custom";
  extras: string[];
  offer?: SetOffer;
};

export function setExtras(base: Product, products: Product[], setting?: ProductSet) {
  if (!setting) return complementaryAccessories(base, products, 2);
  if (setting.mode === "hidden") return [];
  return setting.extras.flatMap(id => {
    const item = products.find(p => p.id === id);
    return item && (!item.choices?.length || item.choices.some(v => v.available)) ? [item] : [];
  });
}

export function accessoryColor(product: Product) {
  return product.choices?.find(v => v.available)?.color ?? product.colors[0] ?? "";
}

export function setCombinations(items: Product[]) {
  let rows: string[][] = [[]];
  for (const [index, item] of items.entries()) {
    const choices = item.choices?.filter(v => v.available && (!index || v.color === accessoryColor(item))) ?? [];
    if (!choices.length || choices.some(v => !/^gid:\/\/shopify\/ProductVariant\/\d+$/.test(v.id))) {
      throw new Error(`למוצר ${item.name} חסרה וריאציה זמינה ב־Shopify.`);
    }
    if (rows.length * choices.length > 250) throw new Error("הסט כולל יותר מ־250 שילובי מידות וצבעים. כדי לקבוע מחיר סט, בחרו פחות פריטים משלימים.");
    rows = rows.flatMap(row => choices.map(choice => [...row, choice.id]));
  }
  return rows;
}

export function setCartId(offer: SetOffer) {
  return "complete-set-" + offer.shopifyId.split("/").pop();
}

export function setCartProducts(products: Product[], settings: ProductSet[]): Product[] {
  const catalog = new Map(products.map(p => [p.id, p]));
  return settings.flatMap(setting => {
    const { offer } = setting;
    const base = catalog.get(setting.id);
    if (!offer || !base || setting.mode !== "custom") return [];
    const items = [base, ...setting.extras.map(id => catalog.get(id))];
    const choices = offer.variants.flatMap(row => {
      const parts = row.components.map((id, i) => items[i]?.choices?.find(v => v.id === id));
      if (parts.some(v => !v?.available)) return [];
      const size = parts.map(v => [v!.color, v!.size].filter(Boolean).join(" ") || "יחידה").join(" + ");
      return [{ id: row.id, size, color: "", available: true, price: offer.price }];
    });
    return [{ ...base, id: setCartId(offer), name: `סט ${base.name}`, bundleSourceId: base.id,
      setContents: { productIds: [base.id, ...setting.extras], variants: offer.variants },
      colors: [], sizes: choices.map(v => v.size), choices, price: offer.price, deal: undefined, was: undefined, sku: undefined }];
  });
}

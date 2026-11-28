import { pickVariant, type Product } from "./catalog";
import type { AddItem, CartLine } from "./types";

export type CustomerOrder = {
  id: string; name: string; createdAt: string; cancelledAt: string | null;
  displayFinancialStatus: string | null; displayFulfillmentStatus: string;
  currentTotalPriceSet: { presentmentMoney: { amount: string; currencyCode: string } };
};
export type HistoryLine = {
  id: string; name: string; quantity: number; handle: string | null; variantId: string | null;
};
export type HistoryPage<T> = { items: T[]; next: string | null };

export function orderCartSelection(lines: HistoryLine[], productById: (id: string) => Product | undefined, cart: CartLine[]) {
  const items: AddItem[] = [];
  const unavailable: string[] = [];
  const keys = new Set(cart.map(line => line.key));
  const quantities = new Map<string, number>();
  for (const line of cart) if (line.variantId) quantities.set(line.variantId, (quantities.get(line.variantId) ?? 0) + line.qty);
  for (const line of lines) {
    const product = line.handle ? productById(line.handle) : undefined;
    const choice = product?.choices?.find(v => v.id === line.variantId && v.available);
    const total = (quantities.get(line.variantId ?? "") ?? 0) + line.quantity;
    if (!product || !choice || product.bundleSourceId || product.setContents || product.quantityOfferHidden ||
        !Number.isSafeInteger(line.quantity) || line.quantity < 1 || total > 250 ||
        pickVariant(product, choice.color, choice.size)?.id !== choice.id) {
      unavailable.push(line.name);
      continue;
    }
    const index = product.colors.indexOf(choice.color);
    if (index < 0 && choice.color) { unavailable.push(line.name); continue; }
    const key = `${product.id}|${choice.color}|${choice.size}`;
    if (!keys.has(key) && keys.size >= 50) { unavailable.push(line.name); continue; }
    keys.add(key);
    items.push([product.id, Math.max(0, index), choice.size, line.quantity]);
    quantities.set(choice.id, total);
  }
  return { items, unavailable };
}

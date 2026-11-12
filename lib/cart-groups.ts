import type { Product } from "./catalog";
import type { CartLine } from "./types";
import type { CartQuote } from "./cart-quote";
import { quantityOffer, type QuantityOffer } from "./quantity-offers";

export type CartGroup = { key: string; product: Product; lines: CartLine[]; offer: QuantityOffer | null };

export function offerMissingQuantity(offer: QuantityOffer, count: number) {
  return offer.kind === "quantity" ? Math.max(0, offer.quantity - count) : 0;
}

export function cartGroups(cart: CartLine[], productOf: (id: string) => Product | undefined): CartGroup[] {
  const groups = new Map<string, CartGroup>();
  for (const line of cart) {
    const product = productOf(line.pid);
    if (!product) continue;
    const offer = quantityOffer(product);
    const grouped = offer?.kind === "quantity";
    const key = grouped ? `offer:${product.id}` : `line:${line.key}`;
    const group = groups.get(key);
    if (group) group.lines.push(line);
    else groups.set(key, { key, product, lines: [line], offer: grouped ? offer : null });
  }
  return [...groups.values()];
}

export function cartGroupPrice(lines: CartLine[], quote?: CartQuote) {
  if (!quote) return null;
  const quantities = new Map<string, number>();
  for (const line of lines) {
    if (!line.variantId) return null;
    quantities.set(line.variantId, (quantities.get(line.variantId) ?? 0) + line.qty);
  }
  let regular = 0, total = 0;
  for (const [variantId, quantity] of quantities) {
    const price = quote.lines[variantId];
    if (!price || price.quantity !== quantity) return null;
    regular += price.regular;
    total += price.total;
  }
  // Sum actual line discounts once; never multiply the advertised two-unit deal.
  return { regular: Math.round(regular * 100) / 100, total: Math.round(total * 100) / 100, savings: Math.round(Math.max(0, regular - total) * 100) / 100 };
}

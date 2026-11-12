import type { CartLine } from "./types";
import type { CartQuote } from "./cart-quote";

type QuoteLine = Pick<CartLine, "pid" | "color" | "size" | "qty" | "variantId">;

// Price the whole resulting cart: adding a unit can discount units already in it.
export function completionCart(cart: QuoteLine[], additions: QuoteLine[]): QuoteLine[] {
  const merged = new Map<string, QuoteLine>();
  for (const line of [...cart, ...additions]) {
    const key = line.variantId ?? JSON.stringify([line.pid, line.color, line.size]);
    const previous = merged.get(key);
    if (previous) previous.qty += line.qty;
    else merged.set(key, { pid: line.pid, color: line.color, size: line.size, qty: line.qty, variantId: line.variantId });
  }
  return [...merged.values()];
}

export function completionPrice(before?: CartQuote, after?: CartQuote) {
  if (!before || !after) return null;
  const round = (value: number) => Math.round(value * 100) / 100;
  return {
    addedPayment: round(after.total - before.total),
    cartTotal: after.total,
    additionalSavings: round(after.savings - before.savings),
    totalSavings: after.savings,
  };
}

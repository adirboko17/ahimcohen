import type { CartLineDraft, ShopifyCart, ShopifyMoney } from "./shopify/types";

export type CartQuote = {
  regular: number;
  total: number;
  savings: number;
  lines: Record<string, { quantity: number; regular: number; total: number }>;
};

const round = (value: number) => Math.round(value * 100) / 100;
function amount(money: ShopifyMoney | null) {
  const value = money?.amount ? Number(money.amount) : NaN;
  if (!Number.isFinite(value) || value < 0 || money?.currencyCode !== "ILS") throw new Error("Invalid price");
  return value;
}

// Shopify decides which units qualify. In particular, some offers apply only once.
export function cartQuote(cart: ShopifyCart, requested: CartLineDraft[]): CartQuote {
  const lines: CartQuote["lines"] = {};
  for (const line of cart.lines) {
    if (!line.merchandiseId) throw new Error("Missing variant");
    const entry = lines[line.merchandiseId] ??= { quantity: 0, regular: 0, total: 0 };
    entry.quantity += line.quantity;
    entry.regular = round(entry.regular + amount(line.subtotal));
    entry.total = round(entry.total + amount(line.total));
  }
  if (requested.length !== Object.keys(lines).length || requested.some((line) => lines[line.merchandiseId]?.quantity !== line.quantity)) {
    throw new Error("Cart quantity changed");
  }
  const regular = round(Object.values(lines).reduce((sum, line) => sum + line.regular, 0));
  const total = round(Object.values(lines).reduce((sum, line) => sum + line.total, 0));
  return { regular, total, savings: round(Math.max(0, regular - total)), lines };
}

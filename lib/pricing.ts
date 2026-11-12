import { PM, type Product } from "./catalog";
import type { CartLine } from "./types";

export function fmt(n: number) {
  return (Math.round(n * 100) / 100).toLocaleString("he-IL", { maximumFractionDigits: 2 }) + " ₪";
}

export function priceFor(p: Product, n: number) {
  if (p.deal && n >= p.deal[0]) {
    const g = Math.floor(n / p.deal[0]);
    return g * p.deal[1] + (n % p.deal[0]) * p.price;
  }
  return n * p.price;
}

export function cartMath(cart: CartLine[]) {
  const byP: Record<string, number> = {};
  cart.forEach((l) => {
    byP[l.pid] = (byP[l.pid] || 0) + l.qty;
  });
  let regular = 0;
  let total = 0;
  const legacy: CartLine[] = [];
  cart.forEach((line) => {
    if (line.unitPrice == null) {
      legacy.push(line);
      return;
    }
    regular += line.qty * line.unitPrice;
    total += line.qty * line.unitPrice;
  });
  const legacyQty: Record<string, number> = {};
  legacy.forEach((line) => {
    legacyQty[line.pid] = (legacyQty[line.pid] || 0) + line.qty;
  });
  Object.keys(legacyQty).forEach((id) => {
    const p = PM[id];
    if (!p) return;
    regular += legacyQty[id] * p.price;
    total += priceFor(p, legacyQty[id]);
  });
  const count = cart.reduce((a, l) => a + l.qty, 0);
  return { byP, regular, total, savings: regular - total, count };
}

export function saleBadge(p: Product) {
  if (!p.was) return "";
  return "-" + Math.round((1 - p.price / p.was) * 100) + "%";
}

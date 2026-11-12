import type { CartLine } from "./types";

export const CART_STORAGE = "ahim-cart";
export const CHECKOUT_STORAGE = "ahim-pending-checkouts";
type StorageAccess = Pick<Storage, "getItem" | "setItem">;
export type PendingCheckout = { receipt: string; lines: CartLine[]; createdAt: number };

export function pendingCheckouts(storage: StorageAccess): PendingCheckout[] {
  try {
    const parsed = JSON.parse(storage.getItem(CHECKOUT_STORAGE) || "[]");
    return Array.isArray(parsed) ? parsed.filter((entry): entry is PendingCheckout =>
      entry && typeof entry.receipt === "string" && Number.isFinite(entry.createdAt) &&
      Array.isArray(entry.lines) && entry.lines.every((line: CartLine) =>
        line && typeof line.instanceId === "string" && typeof line.key === "string" && Number.isInteger(line.qty) && line.qty > 0)) : [];
  } catch { return []; }
}

export function rememberCheckout(storage: StorageAccess, receipt: string | null, cart: CartLine[]) {
  // StoreProvider already persists changes. Another tab may have added items
  // while Shopify was preparing checkout, so never overwrite its newer basket.
  if (storage.getItem(CART_STORAGE) === null) storage.setItem(CART_STORAGE, JSON.stringify(cart));
  if (!receipt) return;
  const recent = pendingCheckouts(storage).filter((entry) => Date.now() - entry.createdAt < 30 * 86400000);
  storage.setItem(CHECKOUT_STORAGE, JSON.stringify([...recent, { receipt, lines: cart, createdAt: Date.now() }].slice(-10)));
}

function sameItem(a: CartLine, b: CartLine) {
  return !!a.instanceId && a.instanceId === b.instanceId && a.pid === b.pid && a.color === b.color && a.size === b.size && a.variantId === b.variantId;
}

export function removePurchasedLines(cart: CartLine[], purchased: CartLine[]) {
  return cart.flatMap((line) => {
    const bought = purchased.filter((item) => sameItem(line, item)).reduce((sum, item) => sum + item.qty, 0);
    return line.qty > bought ? [{ ...line, qty: line.qty - bought }] : [];
  });
}

// Called only after a server-confirmed payment; synchronously reads the latest
// basket so additions made while the status request was in flight survive.
export function consumeCheckout(storage: StorageAccess, receipt: string): CartLine[] | null {
  const pending = pendingCheckouts(storage);
  const completed = pending.find((entry) => entry.receipt === receipt);
  if (!completed) return null;
  let cart: CartLine[];
  try {
    cart = JSON.parse(storage.getItem(CART_STORAGE) || "[]");
    if (!Array.isArray(cart)) return null;
  } catch { return null; }
  const next = removePurchasedLines(cart, completed.lines);
  // Alternate checkout attempts for the same basket must not consume it twice.
  const remaining = pending.filter((entry) => entry.receipt !== receipt).map((entry) => ({
    ...entry, lines: entry.lines.filter((line) => !completed.lines.some((bought) => sameItem(line, bought))),
  })).filter((entry) => entry.lines.length > 0);
  storage.setItem(CART_STORAGE, JSON.stringify(next));
  storage.setItem(CHECKOUT_STORAGE, JSON.stringify(remaining));
  return next;
}

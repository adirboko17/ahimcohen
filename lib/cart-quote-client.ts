import type { CartQuote } from "./cart-quote";
import type { CartLine } from "./types";

export type QuoteLine = Pick<CartLine, "pid" | "color" | "size" | "qty" | "variantId" | "packUnits">;
type Response = { ok: true; quote: CartQuote } | { ok: false; error: string };
const TTL = 30_000;
const cache = new Map<string, { quote: CartQuote; expires: number }>();
const pending = new Map<string, Promise<Response>>();

// Prices depend on exact variants and quantities, not line order or translated labels.
export function quoteSignature(lines: QuoteLine[]) {
  const merged = new Map<string, QuoteLine>();
  for (const line of lines) {
    const direct = /^gid:\/\/shopify\/ProductVariant\/\d+$/.test(line.variantId ?? "");
    const key = line.packUnits ? JSON.stringify([line.pid, line.variantId, line.packUnits])
      : direct ? line.variantId! : JSON.stringify([line.pid, line.color, line.size]);
    const previous = merged.get(key);
    if (previous) previous.qty += line.qty;
    else merged.set(key, line.packUnits ? { pid: line.pid, color: "", size: "", qty: line.qty, variantId: line.variantId, packUnits: line.packUnits } : direct
      ? { pid: "", color: "", size: "", variantId: line.variantId, qty: line.qty }
      : { pid: line.pid, color: line.color, size: line.size, qty: line.qty });
  }
  return JSON.stringify([...merged].sort(([a], [b]) => a.localeCompare(b)).map(([, line]) => line));
}

export function cachedCartQuote(signature: string) {
  const entry = cache.get(signature);
  if (!entry) return undefined;
  if (entry.expires <= Date.now()) { cache.delete(signature); return undefined; }
  return entry.quote;
}

export function invalidateCartQuotes() {
  cache.clear();
  // An older request may finish after a retry. Its result must not refill the cache.
  pending.clear();
}

export function requestCartQuote(signature: string): Promise<Response> {
  const cached = cachedCartQuote(signature);
  if (cached) return Promise.resolve({ ok: true, quote: cached });
  const running = pending.get(signature);
  if (running) return running;
  const request: Promise<Response> = Promise.resolve().then(async (): Promise<Response> => {
    try {
      const response = await fetch("/api/shopify/cart/quote", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines: JSON.parse(signature) }), cache: "no-store",
        signal: AbortSignal.timeout(22_000),
      });
      if (!response.ok) throw new Error("Quote failed");
      const result: Response = await response.json();
      if (result.ok && pending.get(signature) === request) {
        if (cache.size >= 80) cache.delete(cache.keys().next().value!);
        cache.set(signature, { quote: result.quote, expires: Date.now() + TTL });
      }
      return result;
    } catch {
      return { ok: false, error: "לא הצלחנו לעדכן את המחיר. נסו שוב." };
    } finally {
      if (pending.get(signature) === request) pending.delete(signature);
    }
  });
  pending.set(signature, request);
  return request;
}

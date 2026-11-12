import "server-only";
import { createHash } from "node:crypto";

const RETENTION_SECONDS = 35 * 24 * 60 * 60;

function paymentKey(shop: string, cartToken: string) {
  // Store only a payment marker, never the order payload or customer details.
  return `ahim:checkout-paid:${createHash("sha256").update(`${shop}\n${cartToken}`).digest("hex")}`;
}

async function redis(command: (string | number)[]) {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim() || process.env.KV_REST_API_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim() || process.env.KV_REST_API_TOKEN?.trim();
  if (!url || !token || new URL(url).protocol !== "https:") throw new Error("Payment storage is not configured");
  const response = await fetch(url, {
    method: "POST", cache: "no-store", signal: AbortSignal.timeout(2500),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(command),
  });
  if (!response.ok) throw new Error("Payment storage unavailable");
  const data = await response.json();
  if (data.error || !("result" in data)) throw new Error("Payment storage command failed");
  return data.result as unknown;
}

export async function markCheckoutPaid(shop: string, cartToken: string) {
  // NX makes duplicate/retried deliveries harmless without extending retention.
  const result = await redis(["SET", paymentKey(shop, cartToken), "paid", "EX", RETENTION_SECONDS, "NX"]);
  if (result !== "OK" && result !== null) throw new Error("Payment marker was not saved");
}

export async function isCheckoutPaid(shop: string, cartToken: string) {
  const result = await redis(["GET", paymentKey(shop, cartToken)]);
  if (result !== null && result !== "paid") throw new Error("Invalid payment marker");
  return result === "paid";
}

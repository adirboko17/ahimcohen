import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { shopDomain } from "./config";
import { isCheckoutPaid } from "./checkout-payments";

const MAX_AGE = 30 * 24 * 60 * 60 * 1000;
const TOKEN = /^[A-Za-z0-9_-]{8,256}$/;
type Receipt = { cartToken: string; shop: string; expires: number };
export type CheckoutStatus = "completed" | "pending" | "unknown" | "expired";

function signingKey() {
  // Never sign with a public Storefront token.
  return process.env.SHOPIFY_CHECKOUT_STATUS_SECRET?.trim()
    || process.env.SHOPIFY_STOREFRONT_PRIVATE_TOKEN?.trim()
    || process.env.PRIVATE_STOREFRONT_API_TOKEN?.trim()
    || process.env.SHOPIFY_WEBHOOK_SECRET?.trim();
}

export function checkoutReceipt(cartId: string): string | null {
  const key = signingKey();
  const token = /^gid:\/\/shopify\/Cart\/([^?]+)(?:\?.*)?$/.exec(cartId)?.[1];
  if (!key || !token || !TOKEN.test(token)) return null;
  const receipt: Receipt = { cartToken: token, shop: shopDomain(), expires: Date.now() + MAX_AGE };
  const payload = Buffer.from(JSON.stringify(receipt)).toString("base64url");
  return `${payload}.${createHmac("sha256", key).update(payload).digest("base64url")}`;
}

function readReceipt(value: string): Receipt | null {
  const key = signingKey();
  if (!key || typeof value !== "string" || value.length > 2048) return null;
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  const expected = createHmac("sha256", key).update(payload).digest();
  const supplied = Buffer.from(signature, "base64url");
  if (supplied.length !== expected.length || !timingSafeEqual(expected, supplied)) return null;
  try {
    const receipt = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Receipt;
    return TOKEN.test(receipt.cartToken) && receipt.shop === shopDomain() && Number.isFinite(receipt.expires) ? receipt : null;
  } catch { return null; }
}

// Only a durable marker written by the authenticated orders/paid webhook can
// consume the basket. No Admin API token or client-provided success flag is used.
export async function checkoutStatus(value: string): Promise<CheckoutStatus> {
  const receipt = readReceipt(value);
  if (!receipt) return "unknown";
  if (receipt.expires < Date.now()) return "expired";
  try {
    return await isCheckoutPaid(receipt.shop, receipt.cartToken) ? "completed" : "pending";
  } catch { return "unknown"; }
}

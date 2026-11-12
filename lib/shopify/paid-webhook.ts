import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { shopDomain } from "./config";
import { markCheckoutPaid } from "./checkout-payments";

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const CART_TOKEN = /^[A-Za-z0-9_-]{8,256}$/;

async function rawBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally { reader.releaseLock(); }
}

export async function receivePaidWebhook(request: Request): Promise<Response> {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET?.trim();
  if (!secret) return new Response("Webhook is not configured", { status: 503 });
  const signature = request.headers.get("x-shopify-hmac-sha256") ?? "";
  if (!/^[A-Za-z0-9+/]{43}=$/.test(signature)) return new Response("Invalid signature", { status: 401 });
  let raw: Buffer | null;
  try { raw = await rawBody(request); }
  catch { return new Response("Invalid body", { status: 400 }); }
  if (!raw) return new Response("Payload too large", { status: 413 });
  const expected = createHmac("sha256", secret).update(raw).digest();
  const received = Buffer.from(signature, "base64");
  if (received.length !== expected.length || !timingSafeEqual(expected, received)) {
    return new Response("Invalid signature", { status: 401 });
  }
  const shop = request.headers.get("x-shopify-shop-domain")?.toLowerCase();
  if (shop !== shopDomain()) return new Response("Wrong shop", { status: 403 });
  if (request.headers.get("x-shopify-topic") !== "orders/paid") return new Response("Ignored", { status: 200 });
  let order: { id?: unknown; cart_token?: unknown; financial_status?: unknown; cancelled_at?: unknown };
  try {
    order = JSON.parse(raw.toString("utf8"));
    if (!order || typeof order !== "object") throw new Error("Invalid order");
  } catch { return new Response("Invalid JSON", { status: 400 }); }
  // Also inspect the signed body. A forged topic header is not proof of payment.
  if (order.financial_status !== "paid" || order.cancelled_at != null) return new Response("Ignored", { status: 200 });
  if (!((typeof order.id === "number" && Number.isFinite(order.id) && order.id > 0)
    || (typeof order.id === "string" && /^\d+$/.test(order.id)))) return new Response("Invalid order", { status: 400 });
  // POS, draft and test notifications can have no storefront cart; acknowledge
  // them without marking any local basket as purchased.
  if (typeof order.cart_token !== "string" || !CART_TOKEN.test(order.cart_token)) return new Response("Ignored", { status: 200 });
  try {
    await markCheckoutPaid(shop, order.cart_token);
    return new Response("OK", { status: 200 });
  } catch {
    // Acknowledge only AFTER durable storage. Shopify must retry on failure.
    return new Response("Payment storage unavailable", { status: 503 });
  }
}

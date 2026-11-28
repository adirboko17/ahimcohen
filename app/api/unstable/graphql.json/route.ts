import { createShopifyRequestContext, createStorefrontClient, defineShopifyI18n, handleShopifyRoutes } from "@shopify/hydrogen";
import { buyerIpFrom } from "@/lib/shopify/client";
import { shopDomain } from "@/lib/shopify/config";

// Shopify's Customer Privacy API reads and persists consent on the storefront origin.
export async function POST(request: Request) {
  const headers = new Headers();
  for (const [name, value] of request.headers) {
    if (["content-type", "accept", "user-agent", "sec-gpc", "origin", "referer",
      "shopify-storefront-consent-management", "x-shopify-storefront-access-token"].includes(name)) headers.set(name, value);
  }
  const cookies = (request.headers.get("cookie") ?? "").split(";").map(s => s.trim())
    .filter(s => /^(?:_shopify_[\w]+|_tracking_consent|localization)=/.test(s)).join("; ");
  if (cookies) headers.set("cookie", cookies);
  const buyerIp = buyerIpFrom(request);
  const incoming = new Request(request.url, { method: "POST", headers, body: await request.text(), signal: request.signal });
  const input = { request: incoming, i18n: defineShopifyI18n({ defaultLocale: { country: "IL", language: "HE" } }) };
  const requestContext = buyerIp ? createShopifyRequestContext({ ...input, buyerIp }) : createShopifyRequestContext(input);
  const storefrontClient = createStorefrontClient({ type: "public", requestContext, config: { storeDomain: shopDomain() } });
  return await handleShopifyRoutes({ request: incoming, requestContext, storefrontClient }) ?? new Response(null, { status: 404 });
}

import "server-only";
import type { MetafieldIdentifier } from "./types";

const PUBLIC_SHOP_DOMAIN = "ahim-cohenn.myshopify.com";

const DOMAIN_KEYS = [
  "SHOPIFY_STORE_DOMAIN",
  "SHOPIFY_STOREFRONT_DOMAIN",
  "PUBLIC_STORE_DOMAIN",
  "SHOPIFY_SHOP_DOMAIN",
  "SHOPIFY_SHOP",
] as const;

const TOKEN_KEYS = [
  "SHOPIFY_STOREFRONT_PRIVATE_TOKEN",
  "PRIVATE_STOREFRONT_API_TOKEN",
  "SHOPIFY_STOREFRONT_API_TOKEN",
] as const;

const PUBLIC_TOKEN_KEYS = [
  "SHOPIFY_STOREFRONT_PUBLIC_TOKEN",
  "PUBLIC_STOREFRONT_API_TOKEN",
] as const;

const VERSION_KEYS = ["SHOPIFY_STOREFRONT_API_VERSION", "SHOPIFY_API_VERSION"] as const;

const LEAKED_TOKEN_KEYS = [
  "NEXT_PUBLIC_SHOPIFY_STOREFRONT_PRIVATE_TOKEN",
  "NEXT_PUBLIC_PRIVATE_STOREFRONT_API_TOKEN",
  "NEXT_PUBLIC_SHOPIFY_STOREFRONT_API_TOKEN",
  "NEXT_PUBLIC_SHOPIFY_STOREFRONT_ACCESS_TOKEN",
] as const;

export class ShopifyError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
    this.name = "ShopifyError";
  }
}

function read(names: readonly string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return "";
}

export function shopDomain() {
  const raw = read(DOMAIN_KEYS) || PUBLIC_SHOP_DOMAIN;
  const host = raw
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*(\.[a-z0-9-]+)+$/.test(host)) {
    throw new ShopifyError("SHOPIFY_STORE_DOMAIN is not a valid shop domain.", 503);
  }
  return host;
}

export function storefrontApiVersion() {
  const version = read(VERSION_KEYS) || "2026-10";
  if (!/^\d{4}-\d{2}$/.test(version) && version !== "unstable") {
    throw new ShopifyError("SHOPIFY_STOREFRONT_API_VERSION is not a valid API version.", 503);
  }
  return version;
}

export function storefrontAuthHeader(): Record<string, string> {
  const leaked = LEAKED_TOKEN_KEYS.find((key) => process.env[key]?.trim());
  if (leaked) {
    throw new ShopifyError(
      `The Storefront token is set as ${leaked}. Remove the NEXT_PUBLIC_ prefix so it stays on the server.`,
      503,
    );
  }
  const privateToken = read(TOKEN_KEYS);
  if (privateToken) return { "Shopify-Storefront-Private-Token": privateToken };
  const publicToken = read(PUBLIC_TOKEN_KEYS);
  if (publicToken) return { "X-Shopify-Storefront-Access-Token": publicToken };
  throw new ShopifyError(
    "Missing SHOPIFY_STOREFRONT_PRIVATE_TOKEN in .env.local. The token must stay server-side.",
    503,
  );
}

export function metafieldIdentifiers(): MetafieldIdentifier[] {
  const raw = process.env.SHOPIFY_METAFIELD_IDENTIFIERS?.trim();
  if (!raw) return [];
  const identifiers: MetafieldIdentifier[] = [];
  for (const part of raw.split(",")) {
    const match = part.trim().match(/^([_A-Za-z0-9-]+)[.:]([_A-Za-z0-9-]+)$/);
    if (match) identifiers.push({ namespace: match[1], key: match[2] });
  }
  return identifiers.slice(0, 20);
}

export function storefrontEndpoint() {
  return `https://${shopDomain()}/api/${storefrontApiVersion()}/graphql.json`;
}

import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { after } from "next/server";
import { readCatalogBootstrap } from "./catalog-bootstrap";
import { gzip, gunzip } from "node:zlib";
import { promisify } from "node:util";
import { type Category, type Product } from "@/lib/catalog";
import { metafieldIdentifiers, shopDomain, storefrontApiVersion } from "./config";
import { fetchShopCatalog } from "./fetch-catalog";

export type ShopCatalog = {
  categories: Category[];
  products: Product[];
};

// Share cold loads/background refreshes between concurrent requests in this worker.
// Only public catalog data is cached; carts and checkout still use live requests.
const inFlight = new Map<string, Promise<string>>();
const compress = promisify(gzip);
const decompress = promisify(gunzip);
const lastKnown = new Map<string, string>();

const readCachedCatalog = unstable_cache(
  (scope: string): Promise<string> => {
    const pending = inFlight.get(scope);
    if (pending) return pending;
    // Variant image URLs repeat heavily across sizes. Cache the complete snapshot
    // losslessly compressed so it stays below Next's 2 MB per-entry limit.
    // Compression is server-only; consumers still receive the original catalog.
    const request = fetchShopCatalog()
      .then(async (catalog) => (await compress(JSON.stringify(catalog))).toString("base64"))
      .finally(() => inFlight.delete(scope));
    inFlight.set(scope, request);
    return request;
  },
  ["shop-catalog-v13-variant-options"],
  { revalidate: 60, tags: ["shop-catalog"] },
);

// React shares the same snapshot between layout, metadata and page rendering.
// Next's persistent Data Cache serves expired data while refreshing in the background.
export const loadShopCatalog = cache(async (): Promise<ShopCatalog> => {
  const scope = JSON.stringify([shopDomain(), storefrontApiVersion(), metafieldIdentifiers()]);
  const fallback = lastKnown.get(scope) ?? await readCatalogBootstrap(scope);
  const fresh = readCachedCatalog(scope).then(encoded => {
    lastKnown.set(scope, encoded);
    return encoded;
  });
  let encoded: string;
  if (!fallback) {
    // Local development / a changed store without a compatible build artifact.
    encoded = await fresh;
  } else {
    const safeFresh = fresh.catch(() => {
      console.error("Catalog refresh failed; serving the last prepared snapshot.");
      return fallback;
    });
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      // Give the persistent cache a short chance to return newer data. An empty
      // cache must not make the customer wait for the complete Shopify crawl.
      encoded = await Promise.race([
        safeFresh,
        new Promise<string>(resolve => { timeout = setTimeout(() => resolve(fallback), 150); }),
      ]);
      // Keep cache population alive after the response on serverless platforms.
      // No seed is ever written into the live cache: only a successful live load.
      after(async () => { await safeFresh; });
    } finally {
      clearTimeout(timeout);
    }
  }
  return JSON.parse((await decompress(Buffer.from(encoded, "base64"))).toString("utf8")) as ShopCatalog;
});

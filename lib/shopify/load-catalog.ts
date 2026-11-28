import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { after } from "next/server";
import { readCatalogBootstrap } from "./catalog-bootstrap";
import { gzip, gunzip } from "node:zlib";
import { promisify } from "node:util";
import { type Category, type Product } from "@/lib/catalog";
import type { CategorySources } from "@/lib/category-sorting";
import { metafieldIdentifiers, shopDomain, storefrontApiVersion } from "./config";
import { fetchShopCatalog } from "./fetch-catalog";

export type ShopCatalog = {
  categories: Category[];
  products: Product[];
  categorySources?: CategorySources;
};

// Share cold loads/background refreshes between concurrent requests in this worker.
// Only public catalog data is cached; carts and checkout still use live requests.
const inFlight = new Map<string, Promise<string>>();
const compress = promisify(gzip);
const decompress = promisify(gunzip);
const refreshMs = 60_000;
const lastKnown = new Map<string, { slot: number; encoded: string }>();

const readCachedCatalog = unstable_cache(
  (scope: string, slot: number): Promise<string> => {
    const key = JSON.stringify([scope, slot]);
    const pending = inFlight.get(key);
    if (pending) return pending;
    // Variant image URLs repeat heavily across sizes. Cache the complete snapshot
    // losslessly compressed so it stays below Next's 2 MB per-entry limit.
    // Compression is server-only; consumers still receive the original catalog.
    const request = fetchShopCatalog()
      .then(async (catalog) => (await compress(JSON.stringify(catalog))).toString("base64"))
      .finally(() => inFlight.delete(key));
    inFlight.set(key, request);
    return request;
  },
  ["shop-catalog-v22-product-ids"],
  { revalidate: 300, tags: ["shop-catalog"] },
);

// React shares the same snapshot between layout, metadata and page rendering.
// Give each refresh window its own persistent cache entry. The previous
// snapshot can still serve requests while the current entry is being populated.
export const loadShopCatalog = cache(async (requireFresh = false): Promise<ShopCatalog> => {
  const scope = JSON.stringify([shopDomain(), storefrontApiVersion(), metafieldIdentifiers()]);
  const slot = Math.floor(Date.now() / refreshMs);
  const fallback = lastKnown.get(scope)?.encoded ?? await readCatalogBootstrap(scope);
  const fresh = readCachedCatalog(scope, slot).then(encoded => {
    if ((lastKnown.get(scope)?.slot ?? -1) <= slot) lastKnown.set(scope, { slot, encoded });
    return encoded;
  });
  let encoded: string;
  if (requireFresh || !fallback) {
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

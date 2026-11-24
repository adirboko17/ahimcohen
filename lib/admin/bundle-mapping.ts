import "server-only";
import { createHash } from "node:crypto";
import { cache } from "react";
import { shopDomain } from "@/lib/shopify/config";
import type { AdminBundle } from "./models";

export type BundleVariantMapping = { tierId: string; sourceVariantId: string; variantId: string; price: number };
export type BundleMapping = {
  source_product_id: string;
  shopify_product_id: string;
  revision: string;
  variants: BundleVariantMapping[];
};

export function bundleRevision(tiers: AdminBundle[]) {
  const ordered = [...tiers].sort((a, b) => a.id.localeCompare(b.id));
  const configuration = ordered.map(({ id, name, items, total, sourceVariantIds }) => [id, name, items, total, [...(sourceVariantIds ?? [])].sort()]);
  return createHash("sha256").update(JSON.stringify(configuration)).digest("hex");
}

function connection() {
  const url = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("נדרש חיבור Supabase למיפוי וריאציות הבאנדל.");
  const endpoint = new URL("/rest/v1/ahim_bundle_mappings", url);
  if (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && ["localhost", "127.0.0.1"].includes(endpoint.hostname))) {
    throw new Error("כתובת Supabase אינה תקינה.");
  }
  return { endpoint, headers: { apikey: key, ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}) } };
}

export async function fetchBundleMappings(sourceProductId?: string): Promise<BundleMapping[]> {
  const { endpoint, headers } = connection();
  endpoint.searchParams.set("shop_domain", `eq.${shopDomain()}`);
  if (sourceProductId) endpoint.searchParams.set("source_product_id", `eq.${sourceProductId}`);
  endpoint.searchParams.set("select", "source_product_id,shopify_product_id,revision,variants");
  const response = await fetch(endpoint, { headers, cache: "no-store", signal: AbortSignal.timeout(4000) });
  if (!response.ok) throw new Error("לא ניתן לקרוא את מיפוי הבאנדלים ב־Supabase. בדקו את החיבור והמיגרציה.");
  return await response.json() as BundleMapping[];
}

export const readBundleMappings = cache(() => fetchBundleMappings());

export async function saveBundleMapping(mapping: BundleMapping) {
  const { endpoint, headers } = connection();
  const response = await fetch(endpoint, {
    method: "POST", cache: "no-store", signal: AbortSignal.timeout(6500),
    headers: { ...headers, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ ...mapping, shop_domain: shopDomain() }),
  });
  if (!response.ok) throw new Error("לא ניתן לשמור את מיפוי הבאנדל ב־Supabase.");
}

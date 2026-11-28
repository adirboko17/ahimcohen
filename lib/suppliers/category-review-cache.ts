import "server-only";
import { unstable_cache } from "next/cache";
import { shopDomain } from "@/lib/shopify/config";
import { readCategoryReview, type CategoryReviewSite } from "./category-review";
import { supplierCategoryReviewTag } from "./catalog-model";
import { sitePublication } from "./publication";
import { supplierStorefrontCollections, type SupplierCollectionOption } from "./storefront-collections";

const readCollections = unstable_cache(
  async (_shop: string, _channel: string) => supplierStorefrontCollections(),
  ["supplier-review-collections-v1"],
  { revalidate: 60, tags: [supplierCategoryReviewTag] },
);

const readReport = unstable_cache(
  async (_shop: string, site: CategoryReviewSite, collections: SupplierCollectionOption[]) =>
    [...await readCategoryReview(site, collections)],
  ["supplier-category-review-v2"],
  { revalidate: 60, tags: [supplierCategoryReviewTag] },
);

export function readSupplierReviewCollections() {
  return readCollections(shopDomain(), sitePublication());
}

export async function readSupplierCategoryReport({ domain, pull_started_at, categories, mappings }: CategoryReviewSite) {
  const site = { domain, pull_started_at, categories, mappings };
  const collections = await readSupplierReviewCollections();
  return { collections, groups: await readReport(shopDomain(), site, collections) };
}

import "server-only";
import verifiedProducts from "@/lib/brand-products.json";
import { canonicalBrandName } from "@/lib/brands";

const verified: Record<string, string> = verifiedProducts;
export function productBrand(product: { handle: string; vendor: string }) {
  // Audited assignments are storefront-only. The original supplier value in Shopify is preserved.
  // Do not treat every worker.co.il item as WORKER: it is a multi-brand supplier.
  const vendor = canonicalBrandName(product.vendor);
  return vendor ?? canonicalBrandName(verified[product.handle]);
}

import "server-only";
import verifiedProducts from "@/lib/brand-products.json";

const verified: Record<string, string> = verifiedProducts;
export const verifiedBrandHandles = Object.keys(verified);
const vendorAliases: Record<string, string> = {
  "redback": "Redback", "redback.co.il": "Redback", "carharrt": "Carhartt", "carhartt": "Carhartt",
  "ahim cohenn": "האחים כהן", "האחים כהן – ביגוד והלבשה": "האחים כהן",
};

export function productBrand(product: { handle: string; vendor: string }) {
  // Audited assignments are storefront-only. The original supplier value in Shopify is preserved.
  // Do not treat every worker.co.il item as WORKER: it is a multi-brand supplier.
  const vendor = product.vendor.trim();
  if (vendor && vendor.toLowerCase() !== "worker.co.il") return vendorAliases[vendor.toLowerCase()] ?? vendor;
  return verified[product.handle] ?? (vendor || undefined);
}

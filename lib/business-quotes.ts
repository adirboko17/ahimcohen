import { type Product } from "./catalog";

export const brandingOptions = {
  "הדפס כיס": "לוגו מודפס בחזית הבגד, באזור הכיס",
  "הדפס גב": "לוגו מודפס על גב הבגד",
  "ללא מיתוג": "פריטים ללא לוגו",
};
export const maxLogoBytes = 4 * 1024 * 1024;
export const logoExtensions = [".png", ".jpg", ".jpeg", ".pdf", ".ai", ".svg", ".eps"];
export const maxQuoteItems = 100;
export const maxQuantity = 999999;

export type QuoteContact = { org: string; name: string; phone: string; email: string; notes: string };
export type QuoteItem = { pid: string; sku: string; name: string; color: string; sizes: Record<string, number> };
export type BusinessQuote = { contact: QuoteContact; items: QuoteItem[]; branding: string[]; logoName: string };
export type ProductOption = { sku: string; product: Product };
const BUSINESS_SKUS = ["108", "101", "104", "135-4", "115", "211", "528", "097", "1045", "141", "004"] as const;
const CATALOG_SKU_ALIASES: Partial<Record<(typeof BUSINESS_SKUS)[number], string>> = {
  "115": "115-6", "528": "528N-5", "097": "097N", "004": "004-1",
};

export function businessProductOptions(products: Product[]): ProductOption[] {
  const bySku = new Map<string, Product>();
  for (const product of products) {
    if (product.bundleSourceId || !product.sizes.length) continue;
    for (const sku of [product.sku, ...(product.choices?.map((choice) => choice.sku) ?? [])]) {
      const key = sku?.trim().toUpperCase();
      if (key && !bySku.has(key)) bySku.set(key, product);
    }
  }
  return BUSINESS_SKUS.flatMap((sku) => {
    const product = bySku.get(sku) ?? bySku.get(CATALOG_SKU_ALIASES[sku] ?? "");
    return product ? [{ sku, product }] : [];
  });
}

export function logoError(file: File) {
  if (!file.size || file.size > maxLogoBytes) return "בחרו קובץ לוגו בגודל של עד 4 MB.";
  if (file.name.length > 240 || /[\\/\u0000-\u001f\u007f]/.test(file.name) ||
      !logoExtensions.some(ext => file.name.toLowerCase().endsWith(ext))) return "בחרו לוגו באחד מסוגי הקבצים המוצגים.";
  return "";
}

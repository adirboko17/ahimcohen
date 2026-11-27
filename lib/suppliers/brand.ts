import { BRANDS, brandByName, canonicalBrandName } from "@/lib/brands";
import type { SupplierProduct } from "./redback";

export type SupplierBrand = { name: string; evidence: "source" | "title" | "category" | "supplier-default" | "missing" };
type BrandInput = Pick<SupplierProduct, "domain" | "brand" | "brandCandidates" | "title" | "description" | "attributes" | "category">;

export function supplierBrandName(value?: string | null) {
  const clean = value?.trim();
  if (!clean || /^(?:[-–—]+|generic|unknown|unbranded|default(?: title)?|no brand|n\/?a|ללא מותג|לא ידוע)$/i.test(clean) ||
    /^(?:https?:\/\/)?(?:www\.)?[a-z0-9.-]+\.[a-z]{2,}(?:\/.*)?$/i.test(clean)) return "";
  return canonicalBrandName(clean) ?? "";
}

function normalized(value = "") {
  return value.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

const brandNames = BRANDS.map(brand => ({ name: brand.name, words: normalized(brand.name) }));
const missing: SupplierBrand = { name: "", evidence: "missing" };

export const supplierBrandDomain = (domain: string) => domain.trim().toLowerCase().replace(/^www\./, "");

export function supplierDefaultBrand(domain: string, settings?: Record<string, string>) {
  const key = supplierBrandDomain(domain);
  return settings && Object.hasOwn(settings, key) ? supplierBrandName(settings[key]) : key === "redback.co.il" ? "Redback" : "";
}

export function detectSupplierBrand(product: BrandInput, defaultBrand = supplierDefaultBrand(product.domain ?? "")): SupplierBrand {
  const supplied = supplierBrandName(product.brand);
  if (supplied) return { name: supplied, evidence: "source" };

  const values = new Set(product.brandCandidates?.map(supplierBrandName).filter(Boolean));
  for (const value of (product.attributes ?? []).filter(attribute =>
    /^(?:pa )?(?:brand|manufacturer|מותג|שם המותג|יצרן|שם היצרן)$/i.test(normalized(attribute.name)),
  ).flatMap(attribute => attribute.values.map(supplierBrandName)).filter(Boolean)) values.add(value);
  for (const line of product.description ?? []) {
    const match = line.match(/^(?:Brand|Manufacturer|מותג|יצרן)\s*[:：]\s*([^|·;\n]{1,80})$/i);
    const name = supplierBrandName(match?.[1]);
    if (name) values.add(name);
  }
  if (values.size === 1) return { name: [...values][0], evidence: "source" };
  if (values.size > 1) return missing;

  const titleSegments = (product.title ?? "").split(/[|·]/).map(normalized);
  const titleNames = brandNames.filter(({ words }) => titleSegments[0] === words || titleSegments[0].startsWith(words + " ") ||
    titleSegments.slice(1).includes(words) || titleSegments.some(title => ` ${title} `.includes(` מבית ${words} `)));
  if (titleNames.length === 1) return { name: titleNames[0].name, evidence: "title" };
  if (titleNames.length > 1) return missing;

  const categories = (product.category ?? "").split("·").map(name => name.trim()
    .replace(/^(?:מותג|brand)\s*[:：-]?\s+/i, "").replace(/\s+(?:outlet|sale|אאוטלט|מבצעים)$/i, ""));
  const categoryNames = new Set(categories.map(name => brandByName(name)?.name).filter((name): name is string => !!name));
  if (categoryNames.size > 1) return missing;
  if (categoryNames.size === 1) {
    const [name] = categoryNames;
    if (name !== defaultBrand) return { name, evidence: "category" };
  }
  return defaultBrand ? { name: defaultBrand, evidence: "supplier-default" } : missing;
}

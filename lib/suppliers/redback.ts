import "server-only";
import { load } from "cheerio";
import { catalogPrice } from "./catalog-model";

export const redbackPilot = {
  "39468": { path: "/חולצת-פליז-mackenzie/", model: "MACKENZIE", collections: ["חולצות", "REDBACK חולצות"] },
  "9151": { path: "/redback-ubbk/", model: "UBBK", collections: ["נעלי עבודה ללא מגן"] },
} as const;
export type PilotId = keyof typeof redbackPilot;
export function isPilotId(id: string): id is PilotId {
  return Object.hasOwn(redbackPilot, id);
}

export type SupplierVariant = {
  id: string;
  sku: string;
  options: Record<string, string>;
  available: boolean;
  price: number;
  regular: number;
  image: string;
};
export type SupplierProduct = {
  id: string;
  platform?: "shopify";
  domain?: string;
  brand?: string;
  brandCandidates?: string[];
  productType?: string;
  currency?: string;
  categoryIds?: string[];
  attributes?: {name:string; values:string[]}[];
  url: string;
  title: string;
  category: string;
  description: string[];
  images: string[];
  variants: SupplierVariant[];
};
type WooVariant = {
  variation_id: number;
  sku: string;
  attributes: Record<string, string>;
  is_in_stock: boolean;
  display_price: number;
  display_regular_price: number;
  image: { full_src: string };
};
const clean = (value: string) => value.replace(/\s+/g, " ").trim();

function imageUrl(source?: string) {
  const url = new URL(source ?? "", "https://redback.co.il");
  if (
    url.origin !== "https://redback.co.il" ||
    url.username ||
    url.password ||
    !url.pathname.startsWith("/wp-content/uploads/")
  ) {
    throw new Error("כתובת תמונת המקור אינה תקינה.");
  }
  return url.href;
}

export function parseRedback(html: string, id: PilotId): SupplierProduct {
  const $ = load(html);
  const form = $("form.variations_form").first();
  const title = clean($("h1").first().text());
  if (!title || form.attr("data-product_id") !== id) throw new Error("זהות המוצר בדף Redback השתנתה.");
  const source: WooVariant[] = JSON.parse(form.attr("data-product_variations") || "null");
  if (!Array.isArray(source) || !source.length || source.length > 250)
    throw new Error("רשימת הווריאציות חסרה או חלקית.");

  const axes = form
    .find("select[name^=attribute_]")
    .toArray()
    .map((select) => {
      const name = clean($(select).closest("tr").find("label").first().text());
      const labels = new Map(
        $(select)
          .find("option[value]")
          .toArray()
          .map((option) => [$(option).attr("value")!, clean($(option).text())] as const),
      );
      return { key: $(select).attr("name")!, name: name === "Size" ? "מידה" : name, labels };
    });
  if (!axes.length || axes.some((axis) => !axis.name)) throw new Error("אפשרויות המוצר חסרות.");
  const variants = source.map((row) => {
    if (
      !Number.isSafeInteger(row.variation_id) ||
      typeof row.is_in_stock !== "boolean" ||
      ![row.display_price, row.display_regular_price].every((value) => Number.isFinite(value) && value >= 0)
    ) {
      throw new Error("נתוני מחיר או זמינות חסרים בווריאציה.");
    }
    const options = Object.fromEntries(
      axes.map(({ key, name, labels }) => {
        const value = labels.get(row.attributes[key]);
        if (!value) throw new Error("נמצאה וריאציה ללא מידה או צבע מזוהים.");
        return [name, value];
      }),
    );
    return {
      id: String(row.variation_id),
      options,
      sku: String(row.sku || ""),
      available: row.is_in_stock,
      price: catalogPrice(row.display_price, row.display_regular_price),
      regular: catalogPrice(row.display_price, row.display_regular_price),
      image: imageUrl(row.image.full_src),
    };
  });
  if (
    new Set(variants.map((v) => v.id)).size !== variants.length ||
    new Set(variants.map((v) => JSON.stringify(v.options))).size !== variants.length
  )
    throw new Error("נמצאו וריאציות כפולות במקור.");

  const gallery = $(".woocommerce-product-gallery [data-large_image]")
    .toArray()
    .map((el) => imageUrl($(el).attr("data-large_image")));
  const description = $(".info-container .accordion-body p, .info-container .accordion-body li")
    .toArray()
    .map((el) => clean($(el).clone().find("br").replaceWith(" ").end().text()))
    .filter(Boolean);
  const category = $(".breadcrumb_last")
    .first()
    .parent()
    .find("a")
    .slice(1)
    .map((_, el) => clean($(el).text()))
    .get()
    .join(" › ");
  if (!gallery.length || !description.length || !category)
    throw new Error("הגלריה, התיאור או הקטגוריה חסרים בדף המקור.");
  return {
    id,
    title,
    url: new URL(redbackPilot[id].path, "https://redback.co.il").href,
    category,
    description,
    images: [...new Set([...gallery, ...variants.map((v) => v.image)])],
    variants,
  };
}

export async function scanRedback(id: PilotId) {
  const response = await fetch(new URL(redbackPilot[id].path, "https://redback.co.il"), {
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error(`Redback החזיר שגיאה (${response.status}).`);
  return parseRedback(await response.text(), id);
}

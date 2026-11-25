import "server-only";
import { load } from "cheerio";
import { sourceReader } from "./public-source";
import { canonicalBrandName } from "@/lib/brands";
import { catalogPageSize, catalogPrice, publicMediaUrl, type SourceCategory } from "./catalog-model";
import type { SupplierProduct, SupplierVariant } from "./redback";
type Reader = Awaited<ReturnType<typeof sourceReader>>;
type Term = { id: number; name: string; slug: string };
type Attribute = { name: string; taxonomy?: string; terms: Term[] };
type WooProduct = {
  id: number;
  parent: number;
  name: string;
  type: string;
  permalink: string;
  description: string;
  short_description: string;
  sku: string;
  prices: { price: string; regular_price: string; currency_minor_unit: number; currency_code: string };
  images: { src: string; thumbnail?: string }[];
  categories: Term[];
  brands?: Term[];
  attributes: Attribute[];
  variations: { id: number; attributes: { name: string; value: string }[] }[];
  is_in_stock: boolean;
  is_purchasable: boolean;
  is_on_backorder?: boolean;
};
const api = "/wp-json/wc/store/v1/products";
const plain = (html: string) =>
  load(html || "", null, false)
    .text()
    .replace(/\s+/g, " ")
    .trim();
function id(value: number) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error("מזהה מקור לא תקין.");
  return String(value);
}
function sourceBrand(p: WooProduct) {
  const listed = plain(p.brands?.[0]?.name || "");
  const attribute = p.attributes.find((a) =>
    [a.name, a.taxonomy || ""].some((key) => ["מותג", "brand"].includes(normalize(key))),
  );
  const named = attribute?.terms.length === 1 ? plain(attribute.terms[0].name) : "";
  return canonicalBrandName(listed || named) || "";
}
function normalize(value: string) {
  return decodeURIComponent(value)
    .replace(/^attribute_/, "")
    .replace(/^pa_/, "")
    .toLowerCase()
    .replace(/[-_ ]+/g, " ")
    .trim();
}
function mediaUrl(value: string, domain: string) {
  return publicMediaUrl(value, "https://" + domain);
}
export function wooThumbnail(product: Pick<WooProduct, "images">, domain: string) {
  for (const image of product.images ?? []) {
    for (const url of [image?.thumbnail, image?.src]) {
      if (!url) continue;
      try { return mediaUrl(url, domain); } catch { /* Try the next available photo. */ }
    }
  }
}

export async function wooReviewImages(read: Reader, domain: string, ids: string[]) {
  const params = new URLSearchParams({ include: ids.join(","), per_page: String(ids.length), _fields: "id,images" });
  const { data } = await read(api + "?" + params);
  if (!Array.isArray(data)) throw new Error("לא ניתן לקרוא את תמונות הספק.");
  const images: Record<string, string> = {};
  for (const product of data) {
    const key = String(product.id);
    if (!ids.includes(key)) continue;
    const image = wooThumbnail(product, domain);
    if (image) images[key] = image;
  }
  return images;
}

export async function discoverCategories(domain: string): Promise<SourceCategory[]> {
  const read = await sourceReader(domain);
  const result = new Map<string, SourceCategory>();
  for (let page = 1; ; page++) {
    const { data } = await read(api + "/categories?per_page=100&hide_empty=false&page=" + page);
    if (!Array.isArray(data)) throw new Error("מבנה רשימת הקטגוריות אינו נתמך.");
    const before = result.size;
    for (const c of data)
      result.set(id(c.id), {
        id: id(c.id),
        parent: String(c.parent || 0),
        name: plain(c.name),
        count: Number(c.count) || 0,
      });
    if (data.length < 100) break;
    if (result.size === before) throw new Error("הספק אינו מאפשר לדפדף בין הקטגוריות.");
  }
  return [...result.values()];
}
export async function catalogPage(read: Reader, page: number, categoryIds: string[] = []) {
  const size = catalogPageSize;
  const query = new URLSearchParams({ per_page: String(size), page: String(page), orderby: "id", order: "asc" });
  if (categoryIds.length && categoryIds.join(",").length < 2000) {
    query.set("category", categoryIds.join(","));
    query.set("category_operator", "in");
  }
  const { data, headers } = await read(api + "?" + query);
  if (!Array.isArray(data)) throw new Error("רשימת המוצרים לא נקראה.");
  const pages = Number(headers["x-wp-totalpages"]);
  const reported = Number(headers["x-wp-total"]);
  const offset = (page - 1) * size;
  const hasCount = Number.isSafeInteger(reported) && reported >= offset + data.length;
  let more = data.length === size;
  if (pages > 0) more = page < pages;
  else if (hasCount) more = offset + data.length < reported;
  if (!data.length) more = false;
  return {
    products: data as WooProduct[],
    pages: Number.isSafeInteger(pages) && pages > 0 ? pages : 0,
    total: !more ? offset + data.length : hasCount ? reported : null,
    more,
  };
}
export async function readWooProduct(read: Reader, domain: string, p: WooProduct): Promise<SupplierProduct> {
  if (!["simple", "variable"].includes(p.type)) throw new Error("סוג המוצר אינו מוצר רגיל או מוצר עם וריאציות.");
  const url = new URL(p.permalink);
  if (url.origin !== "https://" + domain) throw new Error("כתובת המוצר שייכת לדומיין אחר.");
  const gallery = p.images.map((i) => mediaUrl(i.src, domain));
  const variationGallery = new Set<string>();
  if (!gallery.length) throw new Error("חסרה תמונת מוצר.");
  const currency = p.prices.currency_code;
  function variant(row: WooProduct, options: Record<string, string>): SupplierVariant {
    const prices = row.prices;
    if (
      typeof row.is_in_stock !== "boolean" ||
      typeof row.is_purchasable !== "boolean" ||
      !prices ||
      prices.currency_code !== currency ||
      !Number.isInteger(prices.currency_minor_unit) ||
      prices.currency_minor_unit < 0 ||
      !/^\d+$/.test(prices.price) ||
      !/^\d+$/.test(prices.regular_price)
    )
      throw new Error("חסרים נתוני מחיר או זמינות לווריאציה.");
    const unit = 10 ** prices.currency_minor_unit;
    const original = catalogPrice(Number(prices.price) / unit, Number(prices.regular_price) / unit);
    return {
      id: id(row.id),
      sku: row.sku || p.sku || "",
      options,
      available: row.is_in_stock && row.is_purchasable && row.is_on_backorder !== true,
      price: original,
      regular: original,
      image: row.images[0] ? mediaUrl(row.images[0].src, domain) : gallery[0],
    };
  }
  // A record that is in stock but not for sale is hidden on the supplier site. Sold-out sizes stay.
  const listed = (row: WooProduct) => !(row.is_purchasable === false && row.is_in_stock === true);
  let variants: SupplierVariant[];
  if (p.type === "simple") {
    if (!listed(p)) throw new Error("המוצר לא מוצע למכירה.");
    variants = [variant(p, { דגם: "רגיל" })];
  } else {
    const rows = new Map<number, WooProduct>();
    for (let page = 1; ; page++) {
      const { data, headers } = await read(api + `?type=variation&parent=${p.id}&per_page=100&page=${page}`);
      if (!Array.isArray(data) || data.some((r) => r.parent !== p.id))
        throw new Error("לא ניתן לאמת את שיוך הווריאציות.");
      const before = rows.size;
      for (const row of data) rows.set(row.id, row);
      if (data.length < 100 || page === Number(headers["x-wp-totalpages"])) break;
      if (before === rows.size) throw new Error("עימוד הווריאציות אינו תקין.");
    }
    if (!p.variations.length || rows.size !== p.variations.length)
      throw new Error("רשימת הווריאציות של הספק חלקית.");
    variants = p.variations.flatMap((ref) => {
      const row = rows.get(ref.id);
      if (!row) throw new Error("חסר פירוט לווריאציה.");
      if (!listed(row)) return [];
      if (!ref.attributes.length) throw new Error("חסר פירוט לווריאציה.");
      for (const image of row.images) variationGallery.add(mediaUrl(image.src, domain));
      const options: Record<string, string> = {};
      let selectable = true;
      for (const attr of ref.attributes) {
        const axis = p.attributes.find((a) =>
          [a.name, a.taxonomy || ""].some((k) => normalize(k) === normalize(attr.name)),
        );
        const term = attr.value
          ? axis?.terms.find((t) => [t.slug, t.name].some((k) => normalize(k) === normalize(attr.value)))
          : axis?.terms.length === 1
            ? axis.terms[0]
            : undefined;
        if (!axis || (!attr.value && !term)) throw new Error("ערך צבע או מידה אינו חד־משמעי.");
        // A variation may still exist in Woo after its value was removed from the public selector.
        if (!term) selectable = false;
        const name = plain(axis.name);
        options[name.toLowerCase() === "size" ? "מידה" : name] = plain(
          term?.name || decodeURIComponent(attr.value),
        );
      }
      const result = variant(row, options);
      return [{ ...result, available: result.available && selectable }];
    });
  }
  if (!variants.length) throw new Error("אין מידות שמוצעות למכירה או שאזלו מהמלאי.");
  const axes = Object.keys(variants[0].options).sort();
  const ordered = [...axes].sort((a, b) => {
    const rank = (name: string) => (/צבע|color|colour/i.test(name) ? 0 : /מידה|size/i.test(name) ? 1 : 2);
    return rank(a) - rank(b) || a.localeCompare(b, "he");
  });
  const combination = (options: Record<string, string>) => ordered.map((axis) => `${axis} ${options[axis]}`).join(", ");
  if (axes.length > 3) throw new Error(`למוצר יש יותר משלוש אפשרויות בחירה: ${ordered.join(", ")}.`);
  if (variants.some((v) => Object.keys(v.options).length !== axes.length || axes.some((a) => !v.options[a])))
    throw new Error(`לחלק מהרשומות חסר ערך עבור ${ordered.join(" או ")}.`);
  const counts = new Map<string, number>();
  for (const v of variants) {
    const key = combination(v.options);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const repeated = [...counts].filter(([, count]) => count > 1);
  if (repeated.length) {
    const shown = repeated
      .slice(0, 4)
      .map(([name, count]) => (count === 2 ? name : `${name} (${count} פעמים)`));
    const more = repeated.length > 4 ? ` ועוד ${repeated.length - 4}` : "";
    throw new Error(`הספק רשם יותר מפעם אחת את אותו שילוב: ${shown.join(" · ")}${more}.`);
  }
  const doc = load(p.description || p.short_description || "", null, false);
  doc("br").replaceWith(" ");
  doc("script,style").remove();
  const lines = doc("li,p")
    .map((_, el) => plain(doc(el).text()))
    .get()
    .filter(Boolean);
  return {
    id: id(p.id),
    domain,
    url: url.href,
    title: plain(p.name),
    brand:
      sourceBrand(p) ||
      (domain === "redback.co.il" && ([39468, 9151].includes(p.id) || /^redback\b/i.test(p.name))
        ? "Redback"
        : ""),
    currency,
    categoryIds: p.categories.map((c) => id(c.id)),
    attributes: p.attributes
      .filter((a) => a.terms.length)
      .map((a) => ({ name: plain(a.name), values: a.terms.map((t) => plain(t.name)) })),
    category: p.categories.map((c) => plain(c.name)).join(" · "),
    description: lines.length ? lines : [plain(doc.text())].filter(Boolean),
    images: [...new Set([...gallery, ...variationGallery, ...variants.map((v) => v.image)])],
    variants,
  };
}
export async function scanWooProduct(domain: string, sourceId: string) {
  const read = await sourceReader(domain);
  if (!/^\d+$/.test(sourceId)) throw new Error("מזהה מוצר לא תקין.");
  const { data } = await read(api + "/" + sourceId);
  if (String(data.id) !== sourceId) throw new Error("זהות המוצר במקור השתנתה.");
  return readWooProduct(read, domain, data);
}

import "server-only";
import { createHash } from "node:crypto";
import { brandingOptions, businessProductOptions, logoError, maxQuantity, maxQuoteItems, type BusinessQuote, type ProductOption } from "@/lib/business-quotes";
import { colorLabel } from "@/lib/catalog";
import { productSizeOptions } from "@/lib/sizes";
import { shopDomain } from "@/lib/shopify/config";
import { loadShopCatalog } from "@/lib/shopify/load-catalog";
import { adminRequest } from "./database";

const bucket = "ahim-business-quotes";
const pageSize = 15;
const objectPath = (folder: "logos" | "requests", name: string, read = false) =>
  "/storage/v1/object/" + (read ? "authenticated/" : "") + bucket + "/" + shopDomain() + "/" + folder + "/" + name;
export const quoteIdPattern = /^[a-f0-9]{64}$/;
export class InvalidQuote extends Error {}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InvalidQuote("פרטי הבקשה אינם תקינים.");
  return value as Record<string, unknown>;
}

function field(value: unknown, max: number, required = true) {
  if (typeof value !== "string" || (required && !value.trim()) || value.length > max || value.includes("\0")) {
    throw new InvalidQuote("בדקו את פרטי ההתקשרות ונסו שוב.");
  }
  return value.trim();
}

function quoteItem(raw: unknown, products: ProductOption[]) {
  const row = record(raw);
  const selected = products.find(({ sku, product }) => sku === row.sku && product.id === row.pid);
  if (!selected) throw new InvalidQuote("אחד הפריטים השתנה. חזרו לבחירת הפריטים ועדכנו את הבקשה.");
  const { product, sku } = selected;
  if (typeof row.color !== "string" || !(product.colors.length ? product.colors : [""]).includes(row.color)) {
    throw new InvalidQuote("בחרו צבע זמין לכל פריט.");
  }
  const available = new Set(productSizeOptions(product, row.color).filter(option => option.value).map(option => option.label));
  const sizes = Object.entries(record(row.sizes)).map(([size, qty]): [string, number] => {
    if (!available.has(size) || typeof qty !== "number" || !Number.isInteger(qty) || qty < 1 || qty > maxQuantity) {
      throw new InvalidQuote("בדקו את המידות והכמויות שנבחרו.");
    }
    return [size, qty];
  });
  if (!sizes.length) throw new InvalidQuote("הזינו כמות לפחות במידה אחת לכל פריט.");
  return { pid: product.id, sku, name: product.name, color: row.color ? colorLabel(row.color) : "", sizes: Object.fromEntries(sizes) };
}

export async function submitBusinessQuote(form: FormData) {
  const raw = form.get("quote");
  const nonce = form.get("submission");
  if (typeof raw !== "string" || raw.length > 65536 || typeof nonce !== "string" || !/^[\da-f-]{36}$/i.test(nonce)) {
    throw new InvalidQuote("פרטי הבקשה אינם תקינים.");
  }
  let input;
  try { input = record(JSON.parse(raw)); } catch { throw new InvalidQuote("פרטי הבקשה אינם תקינים."); }
  const ct = record(input.contact);
  const contact = {
    org: field(ct.org, 200), name: field(ct.name, 200), phone: field(ct.phone, 40),
    email: field(ct.email, 254, false), notes: field(ct.notes, 4000, false),
  };
  const branding = input.branding;
  if (!Array.isArray(branding) || !branding.length || branding.some(b => typeof b !== "string" || !Object.hasOwn(brandingOptions, b))
    || new Set(branding).size !== branding.length || (branding.includes("ללא מיתוג") && branding.length !== 1)) {
    throw new InvalidQuote("בחרו מיקום הדפס או ללא מיתוג.");
  }
  const logo = form.get("logo");
  if (logo !== null && (typeof logo === "string" || branding.includes("ללא מיתוג"))) throw new InvalidQuote("קובץ הלוגו אינו מתאים לבקשה.");
  const fileError = logo && logoError(logo);
  if (fileError) throw new InvalidQuote(fileError);
  if (!Array.isArray(input.items) || !input.items.length || input.items.length > maxQuoteItems) throw new InvalidQuote("בדקו את רשימת הפריטים.");
  const options = businessProductOptions((await loadShopCatalog()).products);
  const items = input.items.map(row => quoteItem(row, options));
  const quote: BusinessQuote = { contact, items, branding, logoName: logo?.name ?? "" };
  const body = JSON.stringify(quote);
  const bytes = logo ? new Uint8Array(await logo.arrayBuffer()) : null;
  const hash = createHash("sha256").update(nonce).update(raw);
  if (logo && bytes) hash.update(logo.name).update(bytes);
  const id = hash.digest("hex");
  // Publish the request only after its attachment exists. Retries address the same objects.
  if (bytes) await adminRequest(objectPath("logos", id), {
    method: "POST", headers: { "Content-Type": "application/octet-stream", "x-upsert": "true" }, body: bytes,
  });
  await adminRequest(objectPath("requests", id + ".json"), {
    method: "POST", headers: { "x-upsert": "true" }, body,
  });
  return id;
}

async function readQuote(id: string): Promise<BusinessQuote> {
  const response = await adminRequest(objectPath("requests", id + ".json", true));
  return response.json();
}

export async function listBusinessQuotes(page: number) {
  const response = await adminRequest("/storage/v1/object/list/" + bucket, {
    method: "POST", body: JSON.stringify({ prefix: shopDomain() + "/requests", limit: pageSize + 1, offset: (page - 1) * pageSize,
      sortBy: { column: "created_at", order: "desc" } }),
  });
  const files: { name: string; created_at: string }[] = await response.json();
  const quotes = await Promise.all(files.slice(0, pageSize).map(async file => {
    const id = file.name.replace(/\.json$/, "");
    if (!quoteIdPattern.test(id)) throw new Error("Invalid stored quote key");
    return { id, createdAt: file.created_at, ...await readQuote(id) };
  }));
  return { quotes, hasNext: files.length > pageSize };
}

export async function quoteLogo(id: string) {
  const { logoName } = await readQuote(id);
  if (!logoName) return null;
  const file = await adminRequest(objectPath("logos", id, true));
  return { name: logoName, body: file.body };
}

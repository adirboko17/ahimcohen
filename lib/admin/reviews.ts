import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { shopDomain } from "@/lib/shopify/config";
import { loadShopCatalog } from "@/lib/shopify/load-catalog";
import type { AdminReview, AdminSaveResult, PublishedReview } from "./models";
import { changeAdminStore, readAdminStore, upsert } from "./storage";

type ReviewFields = Pick<AdminReview, "productId" | "author" | "rating" | "text">;
type ReviewRow = Omit<AdminReview, "productId" | "createdAt" | "source"> & {
  product_id: string;
  created_at: string;
  source: NonNullable<AdminReview["source"]>;
};

function connection() {
  const url = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  const endpoint = new URL("/rest/v1/ahim_product_reviews", url);
  if (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && ["localhost", "127.0.0.1"].includes(endpoint.hostname))) {
    throw new Error("Invalid product reviews database URL");
  }
  return { endpoint, headers: { apikey: key, ...(key.startsWith("eyJ") && { Authorization: `Bearer ${key}` }) } };
}

async function request(database: NonNullable<ReturnType<typeof connection>>, params: Record<string, string>, options: RequestInit = {}) {
  const url = new URL(database.endpoint);
  const query = new URLSearchParams(params);
  if (options.method !== "POST") query.set("shop_domain", `eq.${shopDomain()}`);
  url.search = query.toString();
  const response = await fetch(url, {
    ...options,
    cache: "no-store",
    signal: AbortSignal.timeout(4000),
    headers: { ...database.headers, "Content-Type": "application/json", ...options.headers },
  });
  if (!response.ok) throw new Error(`Product reviews database returned ${response.status}`);
  return response;
}

export async function readReviews(legacy: AdminReview[], productId?: string): Promise<AdminReview[]> {
  const reviews = productId === undefined ? [...legacy] : legacy.filter((item) => item.productId === productId && item.published);
  try {
    const database = connection();
    if (!database) return reviews;
    const filters: Record<string, string> = productId === undefined ? {} : { product_id: `eq.${productId}`, published: "eq.true" };
    const remote: AdminReview[] = [];
    const pageSize = 100;
    for (let offset = 0; ; offset += pageSize) {
      const response = await request(database, {
        select: "id,product_id,author,rating,text,published,source,created_at",
        order: "created_at.desc,id.desc", limit: String(pageSize), offset: String(offset),
        ...filters,
      });
      const rows = await response.json() as ReviewRow[];
      for (const { product_id, created_at, ...row } of rows) remote.push({ ...row, productId: product_id, createdAt: created_at });
      if (rows.length < pageSize) break;
    }
    const remoteIds = new Set(remote.map(({ id }) => id));
    return [...remote, ...reviews.filter(({ id }) => !remoteIds.has(id))];
  } catch (error) {
    console.error("Could not read product reviews", error);
    return reviews;
  }
}

export async function publishedReviews(legacy: AdminReview[], productId: string): Promise<PublishedReview[]> {
  return (await readReviews(legacy, productId)).filter((item) => item.published && item.productId === productId)
    .map(({ id, author, rating, text, createdAt }) => ({ id, author, rating, text, createdAt }));
}

function input(data: FormData, field: string, max: number) {
  const value = data.get(field);
  if (typeof value !== "string") return "";
  const normalized = value.trim().replace(/\r\n?/g, "\n");
  return normalized.length <= max && !normalized.includes("\0") ? normalized : "";
}

async function reviewFields(data: FormData, productId: string): Promise<ReviewFields | AdminSaveResult> {
  const author = input(data, "author", 80);
  const text = input(data, "review", 2000);
  const rating = input(data, "rating", 1);
  if (!/^[1-5]$/.test(rating)) return { ok: false, message: "בחרו דירוג של 1 עד 5 כוכבים." };
  if (!author || !text) return { ok: false, message: "מלאו שם לתצוגה וביקורת באורך של עד 2,000 תווים." };
  const { products } = await loadShopCatalog();
  if (!productId || !products.some(({ id }) => id === productId)) return { ok: false, message: "המוצר כבר אינו זמין." };
  return { productId, author, text, rating: Number(rating) };
}

async function insertReview(database: NonNullable<ReturnType<typeof connection>>, review: AdminReview, deduplicate = false) {
  const { id, productId, author, rating, text, published, source } = review;
  await request(database, deduplicate ? { on_conflict: "shop_domain,id" } : {}, {
    method: "POST",
    headers: { Prefer: deduplicate ? "resolution=ignore-duplicates,return=minimal" : "return=minimal" },
    body: JSON.stringify({ id, shop_domain: shopDomain(), product_id: productId, author, rating, text, published, source }),
  });
}

export async function submitCustomerReview(productId: string, data: FormData): Promise<AdminSaveResult> {
  const received = { ok: true, message: "תודה! הביקורת התקבלה ותופיע לאחר אישור." };
  if (data.get("website")) return received;
  try {
    const fields = await reviewFields(data, productId);
    if ("ok" in fields) return fields;
    const digest = createHash("sha256").update(JSON.stringify(fields)).digest("hex");
    const id = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-${digest.slice(12, 16)}-${digest.slice(16, 20)}-${digest.slice(20, 32)}`;
    const review = { ...fields, id, published: false, source: "customer", createdAt: new Date().toISOString() } as const;
    const database = connection();
    if (database) await insertReview(database, review, true);
    else {
      if (process.env.VERCEL) throw new Error("Product reviews database is not configured");
      await changeAdminStore((store) => {
        if (!store.reviews.some((item) => item.id === id)) store.reviews.unshift(review);
      });
    }
    return received;
  } catch (error) {
    console.error("Could not submit product review", error);
    return { ok: false, message: "שליחת הביקורת נכשלה. נסו שוב בעוד רגע." };
  }
}

export async function saveAdminReview(data: FormData): Promise<AdminSaveResult> {
  const id = input(data, "id", 40);
  const operation = data.get("operation");
  const approve = operation === "approve";
  const missing = { ok: false, message: "הביקורת כבר אינה זמינה." };
  if (operation !== "save" && (!id || (!approve && operation !== "delete"))) return { ok: false, message: "הפעולה אינה תקינה." };
  const fields = operation === "save" ? await reviewFields(data, input(data, "productId", 512)) : null;
  if (fields && "ok" in fields) return fields;
  const published = data.has("published");
  const database = connection();
  const success = { ok: true, message: approve ? "הביקורת אושרה ופורסמה." : fields ? "הביקורת נשמרה." : "הביקורת הוסרה." };

  if (!database || (id && (await readAdminStore()).reviews.some((item) => item.id === id))) {
    if (!database && process.env.VERCEL) throw new Error("Product reviews database is not configured");
    let found = false;
    await changeAdminStore((store) => {
      const previous = store.reviews.find((item) => item.id === id);
      if (id && !previous) return;
      if (approve) {
        if (previous?.source !== "customer") return;
        previous.published = true;
      } else if (fields) upsert(store.reviews, { source: "admin", createdAt: new Date().toISOString(), ...previous, ...fields, id: id || randomUUID(), published });
      else store.reviews = store.reviews.filter((item) => item.id !== id);
      found = true;
    });
    return found ? success : missing;
  }

  if (!id && fields) {
    await insertReview(database, { ...fields, id: randomUUID(), published, source: "admin" });
    return success;
  }
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)) return missing;
  const params: Record<string, string> = { id: `eq.${id}`, select: "id" };
  if (approve) params.source = "eq.customer";
  const values = approve ? { published: true } : fields && { product_id: fields.productId, author: fields.author, rating: fields.rating, text: fields.text, published };
  const response = await request(database, params, {
    method: operation === "delete" ? "DELETE" : "PATCH",
    headers: { Prefer: "return=representation" },
    body: values ? JSON.stringify(values) : undefined,
  });
  return (await response.json()).length ? success : missing;
}

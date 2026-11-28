import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { shopDomain } from "@/lib/shopify/config";
import type { SupplierProduct } from "./redback";
import { originalPriceSnapshot, productDomain, supplierKey } from "./catalog-model";

export type Preview = {
  source_id: string;
  review_state: "known" | "pending" | "ignored";
  supplier: string;
  category_ids: string[];
  manual_price: number | null;
  scan_error: string | null;
  draft_snapshot: SupplierProduct | null;
  snapshot: SupplierProduct;
  revision: string;
  scanned_at: string;
  shopify_product_id: string | null;
  import_token: string | null;
  import_started_at: string | null;
  collection_ids: string[];
  verified_at: string | null;
};

async function supplierResponse(
  table: "ahim_supplier_previews" | "ahim_supplier_sites" | "ahim_supplier_imports" | "ahim_supplier_runners"
    | "ahim_supplier_stock_updates" | "rpc/ahim_resolve_supplier_issue" | "rpc/ahim_supplier_stock_counts",
  method: string,
  params: Record<string, string>,
  body?: unknown,
  prefer = "resolution=merge-duplicates,return=representation",
) {
  const base = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error("חסר חיבור Supabase לשמירת הסריקה.");
  const url = new URL("/rest/v1/" + table, base);
  url.search = new URLSearchParams(params).toString();
  const response = await fetch(url, {
    method,
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
    headers: {
      apikey: key,
      ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}),
      "Content-Type": "application/json",
      Prefer: prefer,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error("שמירת נתוני הספק או קריאתם מ־Supabase נכשלה.");
  return response;
}
export async function supplierRequest<T>(...args: Parameters<typeof supplierResponse>) {
  return (await (await supplierResponse(...args)).json()) as T[];
}
function request(method: string, params: Record<string, string>, body?: unknown) {
  return supplierRequest<Preview>("ahim_supplier_previews", method, params, body);
}
export const shopFilter = () => ({ shop_domain: "eq." + shopDomain() });
const scope = (supplier: string) => ({ ...shopFilter(), supplier: "eq." + supplier });
export async function pendingCount(domain: string) {
  const res = await supplierResponse("ahim_supplier_previews", "HEAD", {
    ...scope(supplierKey(domain)), review_state: "eq.pending", shopify_product_id: "is.null", select: "source_id", limit: "1",
  }, undefined, "count=exact");
  return Number(res.headers.get("content-range")?.split("/").pop()) || 0;
}
export async function ignoreReview(domain: string, id: string) {
  const rows = await request("PATCH", { ...scope(supplierKey(domain)), source_id: "eq." + id, review_state: "eq.pending",
    shopify_product_id: "is.null", import_token: "is.null" }, { review_state: "ignored" });
  if (!rows.length) throw new Error("הרשימה התעדכנה או שהייבוא כבר התחיל.");
}
export function previews(domain = "redback.co.il", params: Record<string, string> = {}) {
  return request("GET", { order: "source_id", ...params, ...scope(supplierKey(domain)) });
}
export async function getPreview(domain: string, id: string) {
  return (await previews(domain, { source_id: "eq." + id, limit: "1" }))[0];
}
export async function saveManualPrice(row: Preview, value: number | null) {
  const saved = await request(
    "PATCH",
    {
      ...scope(row.supplier),
      source_id: "eq." + row.source_id,
      shopify_product_id: "is.null",
      import_token: "is.null",
    },
    { manual_price: value },
  );
  if (!saved.length) throw new Error("ניתן לשנות מחיר לפני יצירת הטיוטה.");
}
const collectionFilter = (ids: string[]) => "eq.{" + ids.map(id => JSON.stringify(id)).join(",") + "}";

export async function saveProductCategory(row: Preview, collections: string | string[]) {
  const saved = await request("PATCH", {
    ...scope(row.supplier),
    source_id: "eq." + row.source_id,
    revision: "eq." + row.revision,
    review_state: "in.(known,pending)",
    scan_error: "is.null",
    shopify_product_id: "is.null",
    import_token: "is.null",
    collection_ids: collectionFilter(row.collection_ids),
  }, { collection_ids: typeof collections === "string" ? [collections] : collections });
  if (!saved.length) throw new Error("המוצר השתנה או שהייבוא כבר התחיל. רעננו את התצוגה.");
}

export async function saveLinkedProductCategories(row: Preview, collections: string[]) {
  const saved = await request("PATCH", {
    ...scope(row.supplier),
    source_id: "eq." + row.source_id,
    shopify_product_id: "eq." + row.shopify_product_id,
  }, { collection_ids: collections });
  if (!saved.length) throw new Error("לא ניתן לעדכן את השיוך של המוצר המקושר.");
}
export async function markScanError(domain: string, id: string, error: string) {
  await request("PATCH", { ...scope(supplierKey(domain)), source_id: "eq." + id }, { scan_error: error });
}
export async function resolveScanIssue(domain: string, id: string, run: string | null, snapshot: SupplierProduct | null) {
  const response = await supplierResponse("rpc/ahim_resolve_supplier_issue", "POST", {}, {
    p_shop: shopDomain(), p_domain: domain, p_id: id, p_run: run, p_snapshot: snapshot,
    p_revision: snapshot ? createHash("sha256").update(JSON.stringify(snapshot)).digest("hex") : null,
  });
  if (await response.json() !== true) throw new Error("רשימת הבדיקה התעדכנה. רעננו ונסו שוב.");
}
export async function savePreview(product: SupplierProduct, notifyIfNew = false) {
  const snapshot = originalPriceSnapshot(product);
  const revision = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
  const values = {
      shop_domain: shopDomain(),
      supplier: supplierKey(productDomain(snapshot)),
      ...(snapshot.categoryIds ? { category_ids: snapshot.categoryIds } : {}),
      source_id: snapshot.id,
      revision,
      scan_error: null,
      snapshot,
      scanned_at: new Date().toISOString(),
    };
  const conflict = { on_conflict: "shop_domain,supplier,source_id" };
  if (notifyIfNew) {
    const added = await supplierRequest<Preview>("ahim_supplier_previews", "POST", conflict,
      { ...values, review_state: "pending" }, "resolution=ignore-duplicates,return=representation");
    if (added.length) return;
  }
  await request("POST", conflict, values);
}
export async function reserveDraft(row: Preview, snapshot: SupplierProduct, collections: string[]) {
  const token = randomUUID();
  if (row.import_token && row.import_started_at && Date.parse(row.import_started_at) > Date.now() - 300000) {
    throw new Error("הייבוא כבר התחיל. אפשר לבדוק את התוצאה שוב בעוד רגע.");
  }
  const rows = await request(
    "PATCH",
    {
      ...scope(row.supplier),
      source_id: "eq." + row.source_id,
      revision: "eq." + row.revision,
      review_state: "eq." + row.review_state,
      shopify_product_id: "is.null",
      manual_price: row.manual_price === null ? "is.null" : "eq." + row.manual_price,
      collection_ids: collectionFilter(row.collection_ids),
      import_token: row.import_token ? "eq." + row.import_token : "is.null",
    },
    {
      import_token: token,
      import_started_at: new Date().toISOString(),
      draft_snapshot: snapshot,
      collection_ids: collections,
    },
  );
  if (!rows.length) throw new Error("הסריקה או מצב הייבוא השתנו. רעננו את המסך.");
  return token;
}
export async function saveDraftId(
  row: Preview,
  draftId: string,
  token: string | null,
  collections: string[],
  snapshot: SupplierProduct,
) {
  const rows = await request(
    "PATCH",
    {
      ...scope(row.supplier),
      source_id: "eq." + row.source_id,
      shopify_product_id: "is.null",
      import_token: token ? "eq." + token : "is.null",
    },
    {
      draft_snapshot: snapshot,
      shopify_product_id: draftId,
      review_state: "known",
      import_token: null,
      import_started_at: null,
      collection_ids: collections,
    },
  );
  if (rows.length !== 1) throw new Error("שמירת הקישור לטיוטה נכשלה.");
}
export async function saveVerification(row: Preview, draftId: string, collections: string[]) {
  const rows = await request(
    "PATCH",
    {
      ...scope(row.supplier),
      source_id: "eq." + row.source_id,
      revision: "eq." + row.revision,
      shopify_product_id: "eq." + draftId,
      collection_ids: collectionFilter(row.shopify_product_id ? row.collection_ids : collections),
      import_token: "is.null",
    },
    { verified_at: new Date().toISOString(), collection_ids: collections },
  );
  if (!rows.length) throw new Error("נתוני הסריקה השתנו בזמן האימות. בדקו את הטיוטה שוב.");
}

export async function saveCorrectedDraftPrices(row: Preview, token: string, snapshot: SupplierProduct) {
  const saved = await request("PATCH", {
    ...scope(row.supplier), source_id: "eq." + row.source_id, shopify_product_id: "eq." + row.shopify_product_id,
    import_token: "eq." + token, revision: "eq." + row.revision, manual_price: "is.null", select: "source_id",
  }, { draft_snapshot: snapshot });
  if (saved.length !== 1) throw new Error("לא ניתן היה לשמור את המחיר המתוקן בקטלוג הספק. נסו שוב.");
}

export async function saveCorrectedDraftBrand(row: Preview, token: string, snapshot: SupplierProduct) {
  const saved = await request("PATCH", {
    ...scope(row.supplier), source_id: "eq." + row.source_id, shopify_product_id: "eq." + row.shopify_product_id,
    import_token: "eq." + token, revision: "eq." + row.revision, select: "source_id",
  }, { draft_snapshot: snapshot });
  if (saved.length !== 1) throw new Error("לא ניתן היה לשמור את המותג המתוקן בקטלוג הספק. נסו שוב.");
}

// Serialize publication and stock refresh for this supplier product across server instances.
export async function withLinkedProductLock<T>(row: Preview, run: (token: string) => Promise<T>) {
  if (!row.shopify_product_id) throw new Error("יש לייבא טיוטה לפני הפרסום.");
  const token = randomUUID();
  const filter = {
    ...scope(row.supplier),
    source_id: "eq." + row.source_id,
    shopify_product_id: "eq." + row.shopify_product_id,
  };
  const expired = new Date(Date.now() - 300000).toISOString();
  const claimed = await request(
    "PATCH",
    {
      ...filter,
      revision: "eq." + row.revision,
      or: `(import_token.is.null,import_started_at.lt.${expired})`,
    },
    { import_token: token, import_started_at: new Date().toISOString() },
  );
  if (!claimed.length) throw new Error("המוצר מתעדכן או שהסריקה השתנתה. רעננו ונסו שוב.");
  try {
    return await run(token);
  } finally {
    await request(
      "PATCH",
      { ...filter, import_token: "eq." + token },
      { import_token: null, import_started_at: null },
    );
  }
}

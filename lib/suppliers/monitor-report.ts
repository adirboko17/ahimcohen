import "server-only";
import { shopDomain } from "@/lib/shopify/config";
import { catalogPageSize, supplierKey, type MonitorReport, type StockChange } from "./catalog-model";
import { importStatuses } from "./import-queue";
import { pendingCount, shopFilter, supplierRequest } from "./storage";
import { detectSupplierBrand, supplierDefaultBrand } from "./brand";
import type { SupplierProduct } from "./redback";

const table = "ahim_supplier_stock_updates";
const siteFilter = (domain: string) => ({ ...shopFilter(), domain: "eq." + domain });

export async function stockUpdateCounts() {
  const rows = await supplierRequest<{ domain: string; product_count: number }>(
    "rpc/ahim_supplier_stock_counts", "POST", {}, { p_shop: shopDomain() },
  );
  return new Map(rows.map(row => [row.domain, row.product_count]));
}

export async function pendingStockUpdate(domain: string, sourceId: string) {
  const [entry] = await supplierRequest<{ id: string; changes: StockChange[] }>(table, "GET", {
    ...siteFilter(domain), source_id: "eq." + sourceId, state: "eq.pending", select: "id,changes", limit: "1",
  });
  return entry;
}

export async function stageStockUpdate(domain: string, sourceId: string, title: string, handle: string, changes: StockChange[]) {
  const [entry] = await supplierRequest<{ id: string }>(table, "POST", { select: "id" }, {
    shop_domain: shopDomain(), domain, source_id: sourceId, title, handle, changes,
  });
  if (!entry) throw new Error("שמירת שינויי המלאי נכשלה.");
  return entry.id;
}

export async function finishStockUpdate(domain: string, id: string, applied: boolean) {
  const rows = await supplierRequest<{ id: string }>(table, "PATCH", {
    ...siteFilter(domain), id: "eq." + id, state: "eq.pending", select: "id",
  }, applied ? { state: "applied", applied_at: new Date().toISOString() } : { state: "discarded" });
  if (rows.length !== 1) throw new Error("אישור שינויי המלאי נכשל.");
}

export async function readMonitorReport(domain: string, kind: MonitorReport["kind"], page: number,
  defaultBrand = supplierDefaultBrand(domain)): Promise<MonitorReport> {
  const range = { limit: String(catalogPageSize + 1), offset: String((page - 1) * catalogPageSize) };
  if (kind === "stock") {
    const rows = await supplierRequest<Extract<MonitorReport, { kind: "stock" }>["items"][number]>(table, "GET", {
      ...siteFilter(domain), ...range, state: "eq.applied", order: "applied_at.desc,id.desc",
      select: "id,title,handle,applied_at,changes",
    });
    return { kind, items: rows.slice(0, catalogPageSize), more: rows.length > catalogPageSize };
  }
  const [rows, total] = await Promise.all([supplierRequest<{
    source_id: string; title: string; category: string; image: string | null; brand: string;
    brandCandidates?: string[]; attributes?: SupplierProduct["attributes"]; description: string[];
  }>("ahim_supplier_previews", "GET", {
    ...shopFilter(), ...range, supplier: "eq." + supplierKey(domain), review_state: "eq.pending",
    shopify_product_id: "is.null", order: "source_id.asc",
    select: "source_id,title:snapshot->>title,category:snapshot->>category,image:snapshot->images->>0,brand:snapshot->>brand,brandCandidates:snapshot->brandCandidates,attributes:snapshot->attributes,description:snapshot->description",
  }), pendingCount(domain)]);
  const visible = rows.slice(0, catalogPageSize);
  const tasks = new Map((await importStatuses(domain, visible.map(row => row.source_id))).map(task => [task.source_id, task]));
  return {
    kind,
    total,
    more: rows.length > catalogPageSize,
    items: visible.map(row => ({
      id: row.source_id, title: row.title, category: row.category, image: row.image,
      brand: detectSupplierBrand(row, defaultBrand),
      task: tasks.get(row.source_id)?.state, error: tasks.get(row.source_id)?.error,
    })),
  };
}

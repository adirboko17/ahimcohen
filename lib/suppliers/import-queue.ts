import "server-only";
import { randomUUID } from "node:crypto";
import { shopDomain } from "@/lib/shopify/config";
import { descendants, mappedCollections, pricedProduct, supplierKey, type Site } from "./catalog-model";
import { getPreview, shopFilter, supplierRequest } from "./storage";
import { importDraft } from "./shopify";

type Task = {
  intent: "draft" | "publish";
  available_at: string;
  domain: string;
  source_id: string;
  revision: string;
  percent: number;
  manual_price: number | null;
  collection_ids: string[];
  attempts: number;
  state: "queued" | "running" | "done" | "failed";
  error: string | null;
};
const table = "ahim_supplier_imports";
export function importStatuses(domain: string, ids: string[]) {
  return ids.length
    ? supplierRequest<Task>(table, "GET", {
        ...shopFilter(),
        domain: "eq." + domain,
        source_id: "in.(" + ids.join(",") + ")",
      })
    : Promise.resolve([]);
}
type Candidate = {
  source_id: string; revision: string; manual_price: number | null; category_ids: string[];
  title: string; currency: string | null; shopify_product_id: string | null; scan_error: string | null; collection_ids: string[];
};
export async function queueImports(site: Site, ids: string[], allCategory?: string, intent: "draft" | "publish" = "draft") {
  if (allCategory === undefined && (!ids.length || ids.some(id => !/^\d+$/.test(id))))
    throw new Error("בחרו מוצרים מהרשימה.");
  if (allCategory && !site.categories.some(c => c.id === allCategory)) throw new Error("קטגוריה לא מוכרת.");
  const scope = { ...shopFilter(), supplier: "eq." + supplierKey(site.domain), review_state:"eq.known" };
  const rows: Candidate[] = [];
  const readCandidates = (filters: Record<string,string>) => supplierRequest<Candidate>("ahim_supplier_previews","GET",{
    ...scope, order:"source_id", limit:"300",
    select:"source_id,revision,manual_price,category_ids,title:snapshot->>title,currency:snapshot->>currency,shopify_product_id,scan_error,collection_ids",
    ...filters,
  });
  if (allCategory === undefined) {
    const selected = [...new Set(ids)];
    for (let start=0; start<selected.length; start+=100) {
      rows.push(...await readCandidates({source_id:"in.("+selected.slice(start,start+100).join(",")+")"}));
    }
    if (rows.length !== selected.length) throw new Error("רשימת המוצרים השתנתה.");
  } else {
    let cursor = "";
    for (;;) {
      const page = await readCandidates({
        ...(intent === "draft" ? {shopify_product_id:"is.null"} : {}),
        ...(allCategory ? {category_ids:"ov.{"+descendants([allCategory],site.categories).join(",")+"}"} : {}),
        ...(cursor ? {source_id:"gt."+cursor} : {}),
      });
      rows.push(...page);
      if (page.length < 300) break;
      cursor = page[page.length-1].source_id;
    }
  }
  const skipped = new Map<string,number>();
  const skip = (reason:string) => skipped.set(reason,(skipped.get(reason) || 0)+1);
  const unresolved = new Set(site.issues?.map(i => i.id));
  let queued = 0;
  for (let offset = 0; offset < rows.length; offset += 80) {
    const chunk = rows.slice(offset,offset+80);
    const linked = chunk.flatMap(r => r.shopify_product_id ? [r.shopify_product_id] : []);
    const states = intent === "publish" && linked.length ? await (await import("./publication")).catalogPublicationStates(linked) : [];
    const existing = await importStatuses(site.domain,chunk.map(r => r.source_id));
    const additions = [];
    for (const row of chunk) {
      const state = states.find(s => s.id === row.shopify_product_id);
      const old = existing.find(t => t.source_id === row.source_id);
      const collections = row.shopify_product_id ? row.collection_ids : mappedCollections(row.category_ids,site);
      let reason = "";
      if (old?.state === "queued" || old?.state === "running") reason = "כבר בתור";
      else if (row.shopify_product_id && intent === "draft") reason = "כבר מקושרים לשופיפיי";
      else if (row.shopify_product_id && state?.status === "ACTIVE" && state.onSite) reason = "כבר פורסמו";
      else if (row.shopify_product_id && (!state || !["DRAFT","ACTIVE"].includes(state.status))) reason = "מוצר יעד לא זמין";
      else if (row.scan_error || unresolved.has(row.source_id)) reason = "דורשים בדיקה";
      else if (!collections.length) reason = "חסר שיוך לאוסף";
      else if (!row.shopify_product_id && row.currency && row.currency !== "ILS" && row.manual_price === null) reason = "נדרש מחיר ידני בשקלים";
      if (reason) { skip(reason); continue; }
      const task = {shop_domain:shopDomain(), domain:site.domain, source_id:row.source_id, revision:row.revision,
        percent:site.percent, manual_price:row.manual_price, collection_ids:collections, intent};
      if (!old) { additions.push(task); continue; }
      const changed = await supplierRequest(table,"PATCH",{...shopFilter(),domain:"eq."+site.domain,
        source_id:"eq."+row.source_id,state:"eq."+old.state,available_at:"eq."+old.available_at},
        {...task,state:"queued",attempts:0,error:null,token:null,available_at:new Date().toISOString()});
      queued += changed.length;
      if (!changed.length) skip("התור התעדכן");
    }
    if (additions.length) {
      const inserted = await supplierRequest(table,"POST",{on_conflict:"shop_domain,domain,source_id"},
        additions,"resolution=ignore-duplicates,return=representation");
      queued += inserted.length;
      if (inserted.length < additions.length)
        skipped.set("כבר בתור",(skipped.get("כבר בתור") || 0)+additions.length-inserted.length);
    }
  }
  if (!rows.length) throw new Error("אין מוצרים מתאימים לפעולה.");
  return {queued,skipped:Array.from(skipped,([reason,n])=>reason+" ("+n+")")};
}
export async function processNextImport() {
  const now = new Date().toISOString();
  const due = { ...shopFilter(), state: "in.(queued,running)", available_at: "lte." + now };
  const [next] = await supplierRequest<Task>(table, "GET", { ...due, order: "available_at", limit: "1" });
  if (!next) return;
  const token = randomUUID(),
    target = { ...shopFilter(), domain: "eq." + next.domain, source_id: "eq." + next.source_id };
  const [claimed] = await supplierRequest<Task>(
    table,
    "PATCH",
    { ...due, ...target },
    { state: "running", token, available_at: new Date(Date.now() + 600000).toISOString() },
  );
  if (!claimed) return;
  const finish = (values: Record<string, unknown>) =>
    supplierRequest(table, "PATCH", { ...target, token: "eq." + token }, { ...values, token: null });
  try {
    let row = await getPreview(claimed.domain, claimed.source_id);
    if (
      !row || row.review_state !== "known" || row.scan_error ||
      (!row.shopify_product_id && (row.revision !== claimed.revision || row.manual_price !== claimed.manual_price))
    )
      throw new Error("התצוגה השתנתה. בדקו את המוצר ובחרו אותו מחדש.");
    if (!row.shopify_product_id || claimed.intent !== "publish") {
      const draft = await importDraft(row, claimed.collection_ids,
        row.draft_snapshot && row.shopify_product_id ? row.draft_snapshot : pricedProduct(row.snapshot, claimed.percent, claimed.manual_price));
      if (claimed.intent === "publish") {
        row = await getPreview(claimed.domain, claimed.source_id);
        if (!row || row.shopify_product_id !== draft.id || row.review_state !== "known" || row.scan_error)
          throw new Error("לא ניתן לאמת את הטיוטה לפני הפרסום.");
      }
    }
    if (claimed.intent === "publish") {
      const {refreshLinkedProduct} = await import("./publication");
      if (!(await refreshLinkedProduct(row,true)).live) throw new Error("הפרסום באתר טרם אומת.");
    }
    await finish({ state: "done", error: null });
  } catch (e) {
    const attempts = claimed.attempts + 1;
    await finish({
      state: attempts < 2 ? "queued" : "failed",
      attempts,
      error: e instanceof Error ? e.message : "הייבוא נכשל",
      available_at: new Date(Date.now() + 310000).toISOString(),
    });
  }
}

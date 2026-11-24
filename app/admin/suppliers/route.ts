import { isAdmin } from "@/lib/admin/access";
import { adminRequestOrigin } from "@/lib/admin/request-origin";
import { getPreview, ignoreReview, markScanError, resolveScanIssue, saveManualPrice, savePreview } from "@/lib/suppliers/storage";
import { readShopifyProduct, rescanShopify, shopifyReviewImages } from "@/lib/suppliers/shopify-source";
import { registerCloudWorker } from "@/lib/suppliers/cloud-worker";
import {
  discoverSite,
  getSite,
  queuePull,
  removeSite,
  saveMappings,
  scheduleMonitor,
  setPercent,
  wakeCatalogWorker,
} from "@/lib/suppliers/sites";
import { manualCollections } from "@/lib/suppliers/shopify";
import { pricedProduct } from "@/lib/suppliers/catalog-model";
import { readCatalogBatch } from "@/lib/suppliers/catalog-batch";
import { normalizeDomain, sourceReader } from "@/lib/suppliers/public-source";
import { scanWooProduct, wooReviewImages } from "@/lib/suppliers/woocommerce";
import { queueImports } from "@/lib/suppliers/import-queue";
import { readMonitorReport } from "@/lib/suppliers/monitor-report";
import { after } from "next/server";
import { importDraft } from "@/lib/suppliers/shopify";
import { refreshLinkedProduct, unpublishLinkedProduct } from "@/lib/suppliers/publication";
import { revalidateTag } from "next/cache";

export async function POST(request: Request) {
  if (!adminRequestOrigin(request) || !(await isAdmin()))
    return Response.json({ message: "נדרשת כניסה לניהול." }, { status: 403 });
  try {
    const form = await request.formData();
    const id = String(form.get("id") ?? "");
    const action = form.get("action");
    if (["monitor","pull","batch","monitor-import"].includes(String(action))) await registerCloudWorker();
    if (action === "remove" && !String(form.get("domain") ?? "").trim())
      throw new Error("חסר דומיין להסרה.");
    const domain = normalizeDomain(String(form.get("domain") || "redback.co.il"));
    if (action === "discover") {
      const savedDomain = await discoverSite(domain);
      return Response.json({ domain: savedDomain, message: "הקטגוריות מוכנות לבחירה." });
    }
    if (action === "remove") {
      await removeSite(domain);
      return Response.json({ message: "האתר הוסר מהרשימה." });
    }
    const site = await getSite(domain);
    if (action === "monitor-report") {
      const kind = form.get("kind"), page = Number(form.get("page"));
      if ((kind !== "new" && kind !== "stock") || !Number.isSafeInteger(page) || page < 1 || page > 1000000)
        throw new Error("בקשת הדוח אינה תקינה.");
      return Response.json(await readMonitorReport(site.domain, kind, page));
    }
    if (action === "monitor-import") {
      const { queued, skipped } = await queueImports(site, form.getAll("item").map(String),
        form.get("scope") === "all" ? "" : undefined, "draft", "pending");
      after(wakeCatalogWorker);
      return Response.json({ message: `${queued} מוצרים נוספו לתור הייבוא כטיוטות.` +
        (skipped.length ? " נדרשת בדיקה: " + skipped.join(" · ") : "") });
    }
    if (action === "catalog-batch") {
      const page = Number(form.get("page"));
      if (!Number.isSafeInteger(page) || page < 1) throw new Error("בקשת הקטלוג אינה תקינה.");
      return Response.json(await readCatalogBatch(site, String(form.get("category") || ""), page, form.get("status") === "imported"));
    }
    if (action === "issue-images") {
      const ids = [...new Set(form.getAll("item").map(String))];
      if (ids.length > 50 || ids.some(id => !/^\d+$/.test(id))) throw new Error("בקשת התמונות אינה תקינה.");
      const pending = new Set(site.issues.map(issue => issue.id));
      const current = ids.filter(id => pending.has(id));
      const lookup = site.platform === "shopify" ? shopifyReviewImages : wooReviewImages;
      const images = current.length ? await lookup(await sourceReader(domain), domain, current) : {};
      return Response.json({ images });
    }
    if (action === "monitor") {
      const raw = String(form.get("hours") ?? "");
      if (!/^\d+$/.test(raw)) throw new Error("בחרו תדירות מעקב.");
      await scheduleMonitor(site, Number(raw));
      return Response.json({ message: Number(raw) ? "המעקב האוטומטי הופעל." : "המעקב הושהה." });
    }
    if (action === "pull" || action === "map") {
      const entries: unknown = JSON.parse(String(form.get("mappings") || "{}"));
      if (!entries || typeof entries !== "object" || Array.isArray(entries)) throw new Error("מיפוי לא תקין.");
      const valid = new Set((await manualCollections()).map((c) => c.id));
      const mappings: Record<string, string[]> = {};
      for (const [cat, ids] of Object.entries(entries)) {
        if (!site.categories.some((c) => c.id === cat) || !Array.isArray(ids) || ids.some((id) => !valid.has(id)))
          throw new Error("אוסף או קטגוריה אינם תקינים.");
        mappings[cat] = [...new Set<string>(ids)];
      }
      if (action === "map") {
        await saveMappings(site, mappings);
        return Response.json({ message: "התאמות הקטגוריות נשמרו." });
      }
      await queuePull(site, form.get("all") === "true", form.getAll("category").map(String), mappings);
      after(wakeCatalogWorker);
      return Response.json({ message: "המשיכה החלה. אפשר לסגור את האדמין." });
    }
    if (action === "percent") {
      await setPercent(domain, Number(form.get("value")));
      return Response.json({ message: "כלל התמחור נשמר." });
    }
    if (action === "batch") {
      const intent = form.get("intent") || "draft";
      if (intent !== "publish" && intent !== "draft") throw new Error("פעולה לא מוכרת.");
      const {queued, skipped} = await queueImports(site, form.getAll("item").map(String),
        form.get("scope")==="all"?String(form.get("category")||""):undefined, intent);
      after(wakeCatalogWorker);
      return Response.json({ message: `${queued} מוצרים נוספו לתור ${intent === "publish" ? "הפרסום באתר" : "הייבוא כטיוטות"}.` +
        (skipped.length ? " דילוגים: " + skipped.join(" · ") : "") });
    }
    if (!/^\d+$/.test(id)) throw new Error("מזהה המוצר אינו תקין.");
    if (action === "ignore") {
      await ignoreReview(domain, id);
      return Response.json({message:"המוצר הוסר מרשימת ההצעות."});
    }
    const row = await getPreview(domain, id);
    if (action === "issue-add" || action === "issue-remove") {
      const issue = site.issues.find(i => i.id === id);
      if (!issue || String(form.get("run") || "") !== (site.pull_started_at || "") ||
        site.state === "queued" || site.state === "running") throw new Error("הסריקה התעדכנה. פתחו את רשימת הבדיקה שוב בסיום המשיכה.");
      let snapshot = null;
      if (action === "issue-add") {
        if (row?.shopify_product_id) {
          const {live} = await refreshLinkedProduct(row, false);
          if (live) revalidateTag("shop-catalog");
          snapshot = (await getPreview(domain,id))?.snapshot;
          if (!snapshot) throw new Error("לא נמצאה תצוגת המוצר המעודכנת.");
        } else if (site.platform === "shopify") {
          snapshot = await readShopifyProduct(await sourceReader(domain), domain, id, site.currency!,
            site.categories.filter(c => (issue.categories || row?.category_ids || []).includes(c.id)));
        } else {
          snapshot = await scanWooProduct(domain,id);
        }
      }
      await resolveScanIssue(domain,id,site.pull_started_at,snapshot);
      return Response.json({message:snapshot ? "הסריקה הצליחה והמוצר זמין בקטלוג." : "המוצר הוסר מקטלוג הספק."});
    }
    if (action === "scan" && !row?.shopify_product_id) {
      if (!row) throw new Error("המוצר טרם נמשך לקטלוג.");
      try {
        await savePreview(row.snapshot.platform === "shopify" ? await rescanShopify(row.snapshot) : await scanWooProduct(domain, id));
      } catch (e) {
        await markScanError(domain, id, e instanceof Error ? e.message : "סריקת המוצר נכשלה.");
        throw e;
      }
      return Response.json({ message: "הסריקה הושלמה." });
    }
    if (!row || row.revision !== form.get("revision")) throw new Error("נתוני הסריקה השתנו. רעננו את התצוגה.");
    if (action === "unpublish") {
      if (!row.shopify_product_id) throw new Error("המוצר טרם יובא ל־Shopify.");
      await unpublishLinkedProduct(row);
      revalidateTag("shop-catalog");
      return Response.json({ message: "המוצר הוסר מהאתר." });
    }
    if (action === "price") {
      const raw = String(form.get("value") ?? "").trim();
      const value = raw === "" ? null : Number(raw);
      if (value !== null && (!Number.isFinite(value) || value < 0)) throw new Error("מחיר ידני אינו תקין.");
      await saveManualPrice(row, value);
      return Response.json({ message: "המחיר נשמר." });
    }
    if (action === "publish" || action === "scan") {
      const { live } = await refreshLinkedProduct(row, action === "publish");
      if (live) revalidateTag("shop-catalog");
      const message = live
        ? action === "publish"
          ? "המוצר פורסם באתר וזמינות הווריאציות אומתה."
          : "זמינות הווריאציות באתר עודכנה ואומתה."
        : "הסריקה הושלמה.";
      return Response.json({ message });
    }
    if (action !== "import") throw new Error("פעולה לא מזוהה.");
    const overrideBrand = form.has("brand") ? String(form.get("brand")).trim() : row.snapshot.brand;
    if (overrideBrand && overrideBrand.length > 150) throw new Error("שם המותג ארוך מדי.");
    const result = await importDraft(
      row,
      [...new Set(form.getAll("collection").map(String))],
      (row.shopify_product_id && row.draft_snapshot) ||
        pricedProduct({ ...row.snapshot, brand: overrideBrand }, site.percent, row.manual_price),
    );
    return Response.json({
      message: `הטיוטה אומתה בשופיפיי · ${result.variants} וריאציות · ${result.images} תמונות`,
      url: result.url,
    });
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "הפעולה נכשלה." }, { status: 422 });
  }
}

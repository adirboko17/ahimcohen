import "server-only";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { loadShopCatalog } from "@/lib/shopify/load-catalog";
import { prepareSetOffer, restoreSetOffer, setOfferStatus } from "@/lib/shopify/product-set-offer";
import type { ProductSet } from "@/lib/product-sets";
import { changeAdminStore } from "./storage";

export async function saveProductSet(data: FormData) {
  const id = String(data.get("productId") ?? "");
  const mode = data.get("mode");
  const { products } = await loadShopCatalog();
  const base = products.find(p => p.id === id);
  if (!base || (mode !== "auto" && mode !== "hidden" && mode !== "custom")) return { ok: false, message: "בחרו מוצר ואופן תצוגה." };
  const extras = mode === "custom" ? data.getAll("extra").map(String) : [];
  const items = [base];
  if (mode === "custom") {
    if (!extras.length || new Set([id, ...extras]).size !== extras.length + 1) return { ok: false, message: "בחרו פריטים משלימים שונים ממוצר הבסיס וזה מזה." };
    for (const extra of extras) {
      const item = products.find(p => p.id === extra);
      if (!item) return { ok: false, message: "בחרו מוצר מהקטלוג לכל פריט משלים." };
      items.push(item);
    }
  }
  const rawPrice = mode === "custom" ? String(data.get("price") ?? "").trim() : "";
  const price = Number(rawPrice);
  if (rawPrice && (!/^\d+(?:\.\d{1,2})?$/.test(rawPrice) || !Number.isFinite(price) || price <= 0 ||
    Math.round(price * 100) >= items.reduce((sum, p) => sum + Math.round(p.price * 100), 0))) {
    return { ok: false, message: "מחיר הסט צריך להיות חיובי ונמוך מסכום מחירי המוצרים." };
  }
  if (rawPrice && items.length > 30) return { ok: false, message: "סט במחיר מיוחד יכול להכיל עד 30 פריטים." };
  let publishing: string | undefined;
  let retiring: string | undefined;
  try {
    await changeAdminStore(async store => {
      const previous = store.sets.find(s => s.id === id);
      if ((previous?.revision ?? "") !== data.get("revision")) throw new Error("הסט השתנה מאז פתיחת המסך. רעננו את העמוד לפני שמירה.");
      const offer = rawPrice ? await prepareSetOffer(items, price, target => { publishing = target; }) : undefined;
      if (previous?.offer && previous.offer.shopifyId !== offer?.shopifyId) {
        retiring = previous.offer.shopifyId;
        await setOfferStatus(retiring, "ARCHIVED");
      }
      store.sets = store.sets.filter(s => s.id !== id);
      if (mode !== "auto") {
        const setting: ProductSet = { id, revision: randomUUID(), mode, extras };
        if (offer) setting.offer = offer;
        store.sets.push(setting);
      }
    });
  } catch (error) {
    // The final database write can fail after Shopify has already applied the change.
    // Re-read under the edit lock, including when the write succeeded but its response was lost.
    if (publishing || retiring) {
      try {
        await changeAdminStore(async store => {
          const current = store.sets.find(s => s.id === id)?.offer?.shopifyId;
          if (retiring && current === retiring) await restoreSetOffer(retiring);
          if (publishing && current !== publishing) await setOfferStatus(publishing, "ARCHIVED");
        });
      } catch {
        return { ok: false, message: "הסנכרון עם Shopify נקטע. רעננו את העמוד ונסו לשמור את הסט שוב." };
      }
    }
    return { ok: false, message: error instanceof Error ? error.message : "שמירת הסט נכשלה." };
  }
  revalidatePath("/admin");
  revalidatePath("/p/" + encodeURIComponent(id));
  return { ok: true, message: "הסט נשמר." };
}

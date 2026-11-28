import "server-only";
import { colorMappingKey } from "../colors";
import { colorFamilies, isColorFamily } from "../color-families";
import { loadShopCatalog } from "../shopify/load-catalog";
import { catalogColorReview } from "./color-review";
import type { AdminSaveResult } from "./models";
import { AdminEditBusy, changeAdminStore } from "./storage";

export async function saveColorMapping(form: FormData): Promise<AdminSaveResult> {
  const key = form.get("id");
  const operation = form.get("operation");
  if (typeof key !== "string" || !key || key.length > 512 || colorMappingKey(key) !== key || (operation !== "save" && operation !== "reset")) {
    return { ok: false, message: "ערך הצבע אינו תקין." };
  }
  const family = String(form.get("family") ?? "");
  const swatch = String(form.get("swatch") ?? "").toUpperCase();
  if (operation === "save") {
    if (!isColorFamily(family) || !/^#[0-9A-F]{6}$/.test(swatch)) return { ok: false, message: "בחרו משפחת צבע וגוון תקינים." };
    const catalog = await loadShopCatalog(true);
    if (!catalogColorReview(catalog.products).some(row => row.key === key)) return { ok: false, message: "ערך הצבע כבר אינו דורש מיפוי בקטלוג." };
  }
  try {
    await changeAdminStore(store => {
      const next = { ...store.colorMappings };
      if (operation === "reset") delete next[key];
      else if (isColorFamily(family)) next[key] = { family, swatch: family === "multicolor" ? colorFamilies.multicolor.swatch : swatch };
      store.colorMappings = next;
    });
  } catch (error) {
    if (error instanceof AdminEditBusy) return { ok: false, message: error.message };
    throw error;
  }
  return { ok: true, message: operation === "reset" ? "מיפוי הצבע אופס." : "מיפוי הצבע נשמר." };
}

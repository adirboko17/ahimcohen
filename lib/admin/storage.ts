import "server-only";
import { randomUUID } from "node:crypto";
import { cache } from "react";
import { shopDomain } from "@/lib/shopify/config";
import { adminDatabase, adminRequest } from "./database";
import { DEFAULT_HERO, type AdminStore } from "./models";

const settingsPath = "/rest/v1/ahim_admin_settings";
const initial = (): AdminStore => ({
  bundles: [], offers: [], hiddenQuantityOffers: [], labels: [], reviews: [], links: [], sales: [], heroes: [DEFAULT_HERO], activeHero: DEFAULT_HERO.id,
});

export const readAdminStore = cache(async (): Promise<AdminStore> => {
  if (!adminDatabase()) return initial();
  const response = await adminRequest(settingsPath, {}, { shop_domain: "eq." + shopDomain(), select: "settings" });
  const [row] = await response.json() as { settings: Partial<AdminStore> }[];
  return { ...initial(), ...row?.settings };
});

export class AdminEditBusy extends Error {}

export async function changeAdminStore(change: (store: AdminStore) => void | Promise<void>) {
  const shop = shopDomain();
  const token = randomUUID();
  const claim = await adminRequest("/rest/v1/rpc/ahim_begin_admin_edit", {
    method: "POST", body: JSON.stringify({ shop, token }),
  });
  const [settings] = await claim.json() as Partial<AdminStore>[];
  if (!settings) throw new AdminEditBusy("מתבצעת שמירה נוספת. נסו שוב בעוד רגע.");
  const filter = { shop_domain: "eq." + shop, writer: "eq." + token, select: "shop_domain" };
  const release = { writer: null, lease_until: null };
  try {
    const store = { ...initial(), ...settings };
    await change(store);
    const saved = await adminRequest(settingsPath, {
      method: "PATCH", headers: { Prefer: "return=representation" },
      body: JSON.stringify({ settings: store, ...release }),
    }, filter);
    if (!(await saved.json()).length) throw new Error("Admin edit expired");
  } catch (error) {
    await adminRequest(settingsPath, { method: "PATCH", body: JSON.stringify(release) }, filter).catch(() => {});
    throw error;
  }
}

export function upsert<T extends { id: string }>(items: T[], value: T) {
  const index = items.findIndex((item) => item.id === value.id);
  if (index < 0) items.unshift(value);
  else items[index] = value;
}

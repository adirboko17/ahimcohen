import "server-only";

import { randomUUID } from "node:crypto";
import { InvalidHeroImage, uploadedHero, uploadHero } from "@/lib/admin/hero-images";
import type { Product } from "@/lib/catalog";
import { activeManagedBundleTiers, bundleGroupSnapshot, bundleTierName, quantityOfferTier, type AdminBundle, type AdminHero, type AdminImage, type AdminOffer, type AdminSaveResult, type AdminStore, type HeroDevice, type HeroTarget } from "@/lib/admin/models";
import { bundleRevision } from "@/lib/admin/bundle-mapping";
import { AdminEditBusy, changeAdminStore, upsert } from "@/lib/admin/storage";
import { quantityOffer } from "@/lib/quantity-offers";
import { syncManagedBundle } from "@/lib/shopify/admin-bundles";
import { shopDomain } from "@/lib/shopify/config";
import { loadShopCatalog } from "@/lib/shopify/load-catalog";

const sections = ["bundles", "offers", "links", "sales", "labels", "heroes"] as const;
type Section = typeof sections[number];
class InvalidInput extends Error {}

function textEntry(value: FormDataEntryValue | null, max = 120) {
  if (value == null) return "";
  if (typeof value !== "string" || value.trim().length > max) throw new InvalidInput("אחד השדות ארוך מדי או לא תקין.");
  return value.trim();
}

function text(data: FormData, name: string, max?: number) {
  return textEntry(data.get(name), max);
}

function required(data: FormData, name: string, max?: number) {
  const value = text(data, name, max);
  if (!value) throw new InvalidInput("מלאו את כל שדות החובה.");
  return value;
}

function number(value: FormDataEntryValue | null, min: number, max: number, integer = true) {
  const amount = typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(amount) || amount < min || amount > max || (integer && !Number.isInteger(amount))) {
    throw new InvalidInput("הכמות, הדירוג או המחיר אינם בטווח התקין.");
  }
  return amount;
}

function link(value: string, allowShortLink = false) {
  if (!value || /[\\\u0000-\u001f\u007f]/.test(value)) throw new InvalidInput("הזינו כתובת HTTPS או נתיב באתר שמתחיל ב־/.");
  if (value.startsWith("/") && !value.startsWith("//")) {
    const parsed = new URL(value, "https://local.invalid");
    if ((allowShortLink || !parsed.pathname.startsWith("/s/")) && !/^\/%2f/i.test(parsed.pathname)) return value;
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol === "https:" && !parsed.username && !parsed.password) return parsed.toString();
  } catch { /* Handled below. */ }
  throw new InvalidInput("הזינו כתובת HTTPS תקינה או נתיב ישיר באתר.");
}

function sourceVariants(product: Product) {
  const ids = [...new Set(product.choices?.map(({ id }) => id).filter((id) => /^gid:\/\/shopify\/ProductVariant\/\d+$/.test(id)))];
  if (!ids.length) throw new InvalidInput("אין למוצר הבסיס וריאציות לסנכרון ב־Shopify.");
  return ids;
}

async function syncQuantityOffer(products: Map<string, Product>, previous?: AdminOffer, next?: AdminOffer) {
  const productIds = new Set<string>();
  if (next?.active) productIds.add(next.productId);
  if (previous?.active && previous.sourceVariantIds?.length) productIds.add(previous.productId);
  const attempted: string[] = [];
  const sync = (productId: string, offer?: AdminOffer) => syncManagedBundle(productId, products.get(productId),
    offer?.active && offer.sourceVariantIds?.length && offer.productId === productId ? [quantityOfferTier(offer)] : [], "quantity-offer");
  try {
    for (const productId of productIds) {
      attempted.push(productId);
      await sync(productId, next);
    }
  } catch (error) {
    for (const productId of attempted.reverse()) await sync(productId, previous).catch(() => {});
    throw new InvalidInput(error instanceof Error ? error.message : "סנכרון מבצע הכמות נכשל.");
  }
}

function saveBundleTiers(store: AdminStore, productId: string, tiers: AdminBundle[]) {
  const featured = tiers.find((tier) => tier.bestValue);
  if (featured) {
    for (const tier of store.bundles) {
      if (tier.active === featured.active && tier.items.length === 1 && tier.items[0][0] === productId) delete tier.bestValue;
    }
  }
  for (const tier of tiers) upsert(store.bundles, tier);
}

async function saveBundleGroup(store: AdminStore, data: FormData) {
  const productId = required(data, "productId", 512);
  const existing = store.bundles.filter((tier) => tier.items.length === 1 && tier.items[0][0] === productId);
  if (text(data, "snapshot", 100000) !== bundleGroupSnapshot(existing)) {
    throw new InvalidInput("מדרגות הבאנדל השתנו מאז שהחלון נפתח. פתחו מחדש את העריכה.");
  }
  const ids = data.getAll("tierId");
  const names = data.getAll("title"), quantities = data.getAll("quantity"), totals = data.getAll("total");
  const active = data.getAll("tierActive"), featured = data.getAll("showInQuantityOffers");
  const mixed = data.getAll("mixedUnits");
  if (ids.length > 249 || [names, quantities, totals, active].some((values) => values.length !== ids.length) ||
    [featured, mixed].some((values) => values.length > 0 && values.length !== ids.length)) {
    throw new InvalidInput("מלאו כמות ומחיר לכל מדרגה.");
  }
  const { products } = await loadShopCatalog();
  const product = products.find((item) => item.id === productId);
  const previous = new Map(existing.map((tier) => [tier.id, tier]));
  const claimed = new Set<string>(), usedQuantities = new Set<number>();
  const bestValue = text(data, "bestValue", 3);
  const bestIndex = bestValue ? number(bestValue, 0, ids.length - 1) : -1;
  const next = ids.map((entry, index): AdminBundle => {
    if (!product) throw new InvalidInput("מוצר הבסיס אינו מופיע בקטלוג.");
    const id = textEntry(entry, 40);
    if (id && (!previous.has(id) || claimed.has(id))) throw new InvalidInput("אחת המדרגות כבר אינה זמינה.");
    if (id) claimed.add(id);
    const prior = previous.get(id);
    const quantity = number(quantities[index], 2, 250);
    if (usedQuantities.has(quantity)) throw new InvalidInput(`כבר קיימת מדרגה של ${quantity} יחידות.`);
    usedQuantities.add(quantity);
    const total = Math.round(number(totals[index], .01, 100000, false) * 100) / 100;
    const linkedPrice = prior?.bundleProductId ? products.find((item) => item.id === prior.bundleProductId)?.price : undefined;
    const showInQuantityOffers = featured.length ? featured[index] === "yes" : prior?.showInQuantityOffers;
    const mixedUnits = mixed.length ? mixed[index] === "yes" : prior?.mixedUnits;
    const preserveLegacy = prior && !mixedUnits && !prior.sourceVariantIds?.length && prior.items[0][1] === quantity && (prior.total ?? linkedPrice) === total;
    return { id: id || randomUUID(), name: textEntry(names[index]) || bundleTierName(quantity), items: [[productId, quantity]],
      ...(preserveLegacy ? { total: prior.total, bundleProductId: prior.bundleProductId, code: prior.code } : { total, sourceVariantIds: sourceVariants(product) }),
      active: active[index] === "yes", ...(index === bestIndex && { bestValue: true }), ...(showInQuantityOffers && { showInQuantityOffers: true }),
      ...(mixedUnits && { mixedUnits: true }) };
  });
  const before = activeManagedBundleTiers(existing, productId);
  const after = activeManagedBundleTiers(next, productId);
  if (after.reduce((count, tier) => count + (tier.sourceVariantIds?.length ?? 0), 0) > 250) {
    throw new InvalidInput("אפשר לסנכרן עד 250 שילובים של כמות ווריאציה למוצר אחד.");
  }
  if (bundleRevision(before) !== bundleRevision(after)) {
    try {
      await syncManagedBundle(productId, product, after);
    } catch (error) {
      await syncManagedBundle(productId, product, before).catch(() => {});
      throw new InvalidInput(error instanceof Error ? error.message : "סנכרון הבאנדל נכשל.");
    }
  }
  store.bundles = [...store.bundles.filter((tier) => !previous.has(tier.id)), ...next];
}

export async function saveAdmin(data: FormData): Promise<AdminSaveResult> {
  try {
    const section = required(data, "section") as Section;
    if (!sections.includes(section)) throw new InvalidInput("הכלי אינו קיים.");
    const id = text(data, "id", 40);
    const operation = text(data, "operation");
    let result: AdminSaveResult = { message: "השינויים נשמרו.", ok: true };
    await changeAdminStore(async (store) => {
      if (section === "bundles" && operation === "save-group") {
        await saveBundleGroup(store, data);
        return;
      }
      if (section === "offers" && (operation === "hide" || operation === "show")) {
        const productId = required(data, "productId", 512);
        if (!store.offers.some((offer) => offer.productId === productId)) {
          const { products } = await loadShopCatalog();
          const product = products.find((item) => item.id === productId);
          if (!product || !quantityOffer(product)) throw new InvalidInput("מבצע הכמות כבר אינו זמין.");
        }
        const hidden = new Set(store.hiddenQuantityOffers);
        if (operation === "hide") hidden.add(productId);
        else hidden.delete(productId);
        store.hiddenQuantityOffers = [...hidden];
        result.message = operation === "hide" ? "מבצע הכמות הוסתר באתר." : "מבצע הכמות מוצג שוב באתר.";
        return;
      }
      if (section === "heroes" && operation === "reorder") {
        const ids = data.getAll("heroId").map((entry) => textEntry(entry, 40));
        const previous = data.getAll("previousHeroId").map((entry) => textEntry(entry, 40));
        const matches = (order: string[]) => order.length === store.heroes.length && store.heroes.every((hero, index) => hero.id === order[index]);
        if (matches(ids)) return;
        if (!matches(previous) || ids.length !== previous.length || new Set(ids).size !== ids.length) {
          throw new InvalidInput("רשימת הבאנרים השתנתה. רעננו את העמוד ונסו שוב.");
        }
        const heroes = new Map(store.heroes.map((hero) => [hero.id, hero]));
        store.heroes = ids.map((heroId) => {
          const hero = heroes.get(heroId);
          if (!hero) throw new InvalidInput("רשימת הבאנרים השתנתה. רעננו את העמוד ונסו שוב.");
          return hero;
        });
        result.message = "סדר הבאנרים נשמר.";
        return;
      }
      if (id && !store[section].some((item) => item.id === id)) throw new InvalidInput("הפריט כבר אינו זמין.");
      if (operation === "delete") {
        if (!id || (section === "heroes" && id === "default")) throw new InvalidInput("אי אפשר למחוק את הפריט הזה.");
        const index = store[section].findIndex((item) => item.id === id);
        if (section === "heroes" && store.activeHero === id) {
          store.activeHero = store.heroes.every((hero) => hero.published === undefined) ? "default" : "";
        }
        if (section === "bundles") {
          const bundle = store.bundles[index];
          if (bundle.active && bundle.sourceVariantIds?.length) {
            const sourceId = bundle.items[0][0];
            const remaining = activeManagedBundleTiers(store.bundles.filter((item) => item.id !== id), sourceId);
            const source = remaining.length ? (await loadShopCatalog()).products.find((item) => item.id === sourceId) : undefined;
            try {
              await syncManagedBundle(sourceId, source, remaining);
            } catch (error) {
              throw new InvalidInput(error instanceof Error ? error.message : "סנכרון הבאנדל נכשל.");
            }
          }
        }
        if (section === "offers") {
          const offer = store.offers[index];
          if (offer.active && offer.sourceVariantIds?.length) {
            const { products } = await loadShopCatalog();
            await syncQuantityOffer(new Map(products.map((product) => [product.id, product])), offer);
          }
        }
        store[section].splice(index, 1);
        result.message = "הפריט הוסר.";
        return;
      }
      if (operation !== "save") throw new InvalidInput("הפעולה אינה תקינה.");
      const recordId = id || randomUUID();
      const warning = await saveSection(store, section, recordId, data);
      if (warning) result = { message: warning, ok: true, warning: true };
    });
    return result;
  } catch (error) {
    const known = error instanceof InvalidInput || error instanceof InvalidHeroImage || error instanceof AdminEditBusy;
    return { ok: false, message: known ? error.message : "השמירה נכשלה. נסו שוב." };
  }
}

async function saveSection(store: AdminStore, section: Section, id: string, data: FormData) {
  if (section === "heroes") {
    await saveHero(store, id, data);
    return;
  }

  if (section === "links") {
    const slug = required(data, "slug", 72).toLowerCase();
    if (!/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(slug)) throw new InvalidInput("השתמשו באותיות באנגלית, ספרות ומקפים בקישור הקצר.");
    if (store.links.some((item) => item.slug === slug && item.id !== id)) throw new InvalidInput("הקישור הקצר כבר בשימוש.");
    upsert(store.links, { id, slug, destination: link(required(data, "destination", 2048)) });
    return;
  }

  const { products } = await loadShopCatalog();
  const byId = new Map(products.map((product) => [product.id, product]));
  const productId = required(data, "productId", 512);
  const product = byId.get(productId);
  if (!product) throw new InvalidInput("בחרו מוצר שקיים בקטלוג.");
  if (section === "bundles") {
    const names = data.getAll("title"), quantities = data.getAll("quantity"), totals = data.getAll("total");
    const featuredOnPage = data.getAll("showInQuantityOffers");
    const mixed = data.getAll("mixedUnits");
    const previous = store.bundles.find((item) => item.id === id);
    if (!names.length || names.length > 249 || names.length !== quantities.length || names.length !== totals.length ||
      (mixed.length > 0 && mixed.length !== names.length)) {
      throw new InvalidInput("מלאו כמות ומחיר לכל מדרגה.");
    }
    const sourceVariantIds = sourceVariants(product);
    if (names.length * sourceVariantIds.length > 250) throw new InvalidInput("אפשר לסנכרן עד 250 שילובים של כמות ווריאציה למוצר אחד.");
    const active = data.has("active");
    const bestValue = text(data, "bestValue", 3);
    const featuredIndex = bestValue ? number(bestValue, 0, names.length - 1) : !data.has("bestValue") && previous?.bestValue ? 0 : -1;
    const usedQuantities = new Set(store.bundles.flatMap((item) => item.id !== id && item.items.length === 1 && item.items[0][0] === productId ? [item.items[0][1]] : []));
    const bundles = names.map((entry, i): AdminBundle => {
      const quantity = number(quantities[i], 2, 250);
      const name = textEntry(entry) || bundleTierName(quantity);
      if (usedQuantities.has(quantity)) throw new InvalidInput(`כבר קיימת למוצר חבילה של ${quantity} יחידות. בחרו כמות אחרת או ערכו את החבילה הקיימת.`);
      usedQuantities.add(quantity);
      const total = Math.round(number(totals[i], .01, 100000, false) * 100) / 100;
      const showInQuantityOffers = featuredOnPage.length ? featuredOnPage[i] === "yes" : i === 0 && previous?.showInQuantityOffers;
      const mixedUnits = mixed.length ? mixed[i] === "yes" : i === 0 && previous?.mixedUnits;
      return { id: i === 0 ? id : randomUUID(), name, items: [[productId, quantity]], total, sourceVariantIds, active,
        ...(i === featuredIndex && { bestValue: true }), ...(showInQuantityOffers && { showInQuantityOffers: true }), ...(mixedUnits && { mixedUnits: true }) };
    });
    const previousSource = previous?.active && previous.sourceVariantIds?.length ? previous.items[0][0] : undefined;
    const affected = new Set<string>(active ? [productId] : []);
    if (previousSource) affected.add(previousSource);
    const next = [...store.bundles.filter((item) => item.id !== id), ...bundles];
    const completed: string[] = [];
    try {
      for (const sourceId of affected) {
        await syncManagedBundle(sourceId, byId.get(sourceId), activeManagedBundleTiers(next, sourceId));
        completed.push(sourceId);
      }
    } catch (error) {
      for (const sourceId of completed.reverse()) {
        await syncManagedBundle(sourceId, byId.get(sourceId), activeManagedBundleTiers(store.bundles, sourceId)).catch(() => {});
      }
      const reason = error instanceof Error ? error.message : "סנכרון הבאנדל נכשל.";
      if (previous?.active) throw new InvalidInput(reason);
      saveBundleTiers(store, productId, bundles.map((bundle) => ({ ...bundle, active: false })));
      return `החבילות נשמרו כטיוטה. ${reason}`;
    }
    saveBundleTiers(store, productId, bundles);
  } else if (section === "labels") {
    if (store.labels.some((item) => item.productId === productId && item.id !== id)) throw new InvalidInput("כבר קיימת תווית למוצר הזה. אפשר לערוך אותה ברשימה.");
    upsert(store.labels, { id, productId, text: required(data, "label", 60) });
  } else if (section === "offers") {
    if (store.offers.some((item) => item.productId === productId && item.id !== id)) throw new InvalidInput("כבר קיים מבצע כמות למוצר הזה. אפשר לערוך אותו ברשימה.");
    const previous = store.offers.find((item) => item.id === id);
    const offer: AdminOffer = { id, productId, quantity: number(data.get("quantity"), 2, 250),
      total: Math.round(number(data.get("total"), .01, 100000, false) * 100) / 100, code: "", active: data.has("active"), sourceVariantIds: sourceVariants(product) };
    const original = quantityOffer(product);
    if (original?.kind === "pack") {
      if (offer.quantity !== original.quantity) throw new InvalidInput("כמות היחידות קבועה במארז הקיים ב־Shopify.");
      if (original.regularTotal ? offer.total >= original.regularTotal : offer.total > product.price) {
        throw new InvalidInput("מחיר המבצע צריך להתאים למחיר הרגיל של המארז.");
      }
    } else if (offer.total >= product.price * offer.quantity) {
      throw new InvalidInput("מחיר המבצע צריך להיות נמוך מהמחיר הרגיל של הכמות.");
    }
    try {
      await syncQuantityOffer(byId, previous, offer);
    } catch (error) {
      if (previous?.active) throw error;
      upsert(store.offers, { ...offer, active: false });
      return `מבצע הכמות נשמר כטיוטה. ${error instanceof Error ? error.message : "הסנכרון נכשל."}`;
    }
    upsert(store.offers, offer);
  } else if (section === "sales") {
    const variantId = required(data, "variantId", 75);
    const match = /^gid:\/\/shopify\/ProductVariant\/(\d+)$/.exec(variantId);
    if (!match || !product.choices?.some((variant) => variant.id === variantId && variant.available)) throw new InvalidInput("בחרו וריאנט זמין של המוצר.");
    const quantity = number(data.get("quantity"), 1, 250);
    const code = text(data, "code", 100);
    const url = new URL(`https://${shopDomain()}/cart/${match[1]}:${quantity}`);
    url.searchParams.set("channel", "buy_button");
    if (code) url.searchParams.set("discount", code);
    upsert(store.sales, { id, title: required(data, "title"), productId, variantId, quantity, code, url: url.toString() });
  }
}

async function saveHero(store: AdminStore, id: string, data: FormData) {
  const previous = store.heroes.find((item) => item.id === id);
  const hero: AdminHero = { id, alt: previous?.alt, published: data.has("published") };
  let catalog: ReturnType<typeof loadShopCatalog> | undefined;

  async function readTarget(device: HeroDevice): Promise<HeroTarget | null> {
    const kind = text(data, `${device}Target`);
    if (kind === "none") return null;
    if (kind === "link") return { kind, href: link(required(data, `${device}Href`, 2048), true) };
    if (kind === "category" || kind === "product") {
      const id = required(data, `${device}TargetId`, 512);
      const { categories, products } = await (catalog ??= loadShopCatalog());
      const item = (kind === "product" ? products : categories).find((entry) => entry.id === id);
      if (!item) throw new InvalidInput(kind === "product" ? "בחרו מוצר שקיים בקטלוג." : "בחרו קטגוריה שקיימת באתר.");
      return { kind, id, label: item.name };
    }
    throw new InvalidInput("בחרו יעד לחיצה תקין לתמונה.");
  }

  const selections = await Promise.all((["desktop", "mobile"] as const).map(async (device) => {
    const field = data.get(device);
    const filename = text(data, device + "Upload");
    let image: AdminImage | undefined = data.has(`${device}Remove`) ? undefined : previous?.[device];
    if (filename) image = await uploadedHero(filename);
    else if (field instanceof File && field.size) image = await uploadHero(field);
    if (!image) return null;
    const target = await readTarget(device);
    return { device, image, target };
  }));
  for (const selection of selections) {
    if (!selection) continue;
    const { device, image, target } = selection;
    hero[device] = { src: image.src, width: image.width, height: image.height, target };
  }
  if (!hero.desktop && !hero.mobile) throw new InvalidInput("בחרו תמונה אחת לפחות.");
  if (previous) upsert(store.heroes, hero);
  else store.heroes.push(hero);
}

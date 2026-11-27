import "server-only";
import { CATS, productSubcategories, type Product, type VariantChoice } from "@/lib/catalog";
import { readAdminStore } from "@/lib/admin/storage";
import { legacyWorkFootwearCategoryName, outdoorFootwear, storefrontCategories, storefrontCategoryPlacements, type CategoryPlacement } from "@/lib/category-placement";
import { packColors } from "@/lib/colors";
import { fetchCollectionsPage } from "./collections";
import { fetchCollectionProductsPage, fetchProductsByHandles, fetchProductsPage } from "./products";
import type { ShopifyCollection, ShopifyProduct } from "./types";
import type { ShopCatalog } from "./load-catalog";
import { productBrand, verifiedBrandHandles } from "./product-brand";

const PAGE = 50;
const MAX_PAGES = 8;

const SUB_ALIASES: Record<string, string[]> = {
  "מקטורונים | טוניקות": ["מקטרונים וחלוקים"],
};

type Placement = { parentId: string; sub: string };
type RedbackType = "גרביים" | "חגורות" | "מעילים" | "מכנסיים" | "חולצות";
const redbackPlaces: Record<RedbackType, Placement> = {
  גרביים: { parentId: "acc", sub: "גרביים" },
  חגורות: { parentId: "acc", sub: "חגורות" },
  מעילים: { parentId: "winter", sub: "מעילים" },
  מכנסיים: { parentId: "pro", sub: "מכנסיים" },
  חולצות: { parentId: "pro", sub: "חולצות" },
};
const redbackTypes = Object.keys(redbackPlaces) as RedbackType[];

export async function fetchShopCatalog(): Promise<ShopCatalog> {
  const [collections, store] = await Promise.all([allCollections(), readAdminStore()]);
  const custom = store.categoryPlacements ?? [];
  const placements = menuPlacements(collections, custom);
  const merged = new Map<string, Product>();
  const redbackItems = new Map<string, { name: string; types: Set<RedbackType> }>();

  function trackRedback(item: ShopifyProduct, product: Product, collectionType?: RedbackType | "") {
    if (collectionType === undefined && norm(product.brand ?? "") !== "redback") return;
    const evidence = redbackItems.get(item.handle) ??
      { name: [item.title, item.productType].filter(Boolean).join(" "), types: new Set<RedbackType>() };
    if (collectionType) evidence.types.add(collectionType);
    redbackItems.set(item.handle, evidence);
  }

  await pool(collections, 3, async (collection) => {
    const pages = await allCollectionProducts(collection.handle);
    const collectionType = redbackCollectionType(collection.title);
    for (const item of pages) {
      const existing = merged.get(item.handle);
      const product = existing ?? toProduct(item, "shop");
      for (const placement of placements.get(collection.handle) ?? []) place(product, placement);
      if (!existing) merged.set(item.handle, product);
      trackRedback(item, product, collectionType);
    }
  });

  if (merged.size === 0) {
    for (const item of await allProducts()) {
      const product = toProduct(item, "shop");
      merged.set(item.handle, product);
      trackRedback(item, product);
    }
  }

  // Some published branded products have no collection. Fetch only the missing
  // audited handles live so their brand links and product pages remain complete.
  const missing = verifiedBrandHandles.filter(handle => !merged.has(handle));
  const batches = Array.from({ length: Math.ceil(missing.length / 10) }, (_, index) => missing.slice(index * 10, index * 10 + 10));
  await pool(batches, 3, async handles => {
    for (const item of await fetchProductsByHandles(handles)) {
      const product = toProduct(item, "shop");
      merged.set(item.handle, product);
      trackRedback(item, product);
    }
  });

  for (const [handle, { name, types }] of redbackItems) {
    const product = merged.get(handle)!;
    if (Object.values(product.categorySubs ?? {}).some(subs => subs.length)) continue;
    const target = redbackProductPlacement(name, types);
    if (target) place(product, target);
  }

  const products = [...merged.values()].filter((product) => !/^ahim-bundle-[a-f0-9]{24}$/.test(product.id));
  const categories = storefrontCategories(CATS, custom).flatMap((parent) => {
    const owned = products.filter((product) => (product.cats ?? [product.cat]).includes(parent.id));
    if (!owned.length) return [];
    const subs = parent.subs.filter(name => owned.some(product => productSubcategories(product, parent.id).includes(name)));
    const image =
      categoryCollectionTitles(parent).map(title => imageFor(collections, title)).find(Boolean) ??
      subs.map((name) => imageFor(collections, name)).find(Boolean) ??
      null;
    return [{ id: parent.id, name: parent.name, subs, image }];
  });

  return { categories, products };
}

type CollectionLabel = Pick<ShopifyCollection, "handle" | "title"> & Partial<Pick<ShopifyCollection, "id">>;

export function menuPlacements(collections: CollectionLabel[], custom: CategoryPlacement[] = []) {
  const placements = new Map<string, Placement[]>();
  const explicit = new Set(custom.map(rule => rule.collectionId));
  const implicit = collections.filter(collection =>
    !explicit.has(collection.id ?? "") || !/^ahim-category-[a-f0-9]{24}$/.test(collection.handle));
  const add = (handle: string, parentId: string, sub: string) => {
    const list = placements.get(handle) ?? [];
    if (!list.some((item) => item.parentId === parentId && item.sub === sub)) list.push({ parentId, sub });
    placements.set(handle, list);
  };

  for (const parent of CATS) {
    for (const sub of parent.subs) {
      for (const handle of titled(implicit, [sub, ...(SUB_ALIASES[sub] ?? [])])) add(handle, parent.id, sub);
    }
    for (const handle of titled(implicit, categoryCollectionTitles(parent))) add(handle, parent.id, "");
  }
  for (const collection of implicit) {
    const type = redbackCollectionType(collection.title);
    // The old shirts collection also contains outerwear and thermal items.
    if (type && type !== "חולצות") {
      const target = redbackPlaces[type];
      add(collection.handle, target.parentId, target.sub);
    }
  }
  const byId = new Map(collections.map(collection => [collection.id, collection.handle]));
  for (const rule of storefrontCategoryPlacements(custom)) {
    const handle = byId.get(rule.collectionId);
    if (handle && rule.parentId !== "redback") add(handle, rule.parentId, rule.label);
  }
  return placements;
}

function redbackCollectionType(title: string): RedbackType | "" | undefined {
  const label = norm(title);
  if (label === "redback") return "";
  return redbackTypes.find(type => label === `redback ${type}` || label === `redback ${type} ${type}`);
}

function redbackProductPlacement(name: string, types: Set<RedbackType>): Placement | undefined {
  const text = norm(name);
  if (/גרב|\bsocks?\b/.test(text)) return redbackPlaces.גרביים;
  if (/חגור[תהו]|\bbelts?\b/.test(text)) return redbackPlaces.חגורות;
  if (/כובע|\b(?:caps?|hats?|beanies)\b/.test(text)) return { parentId: "acc", sub: "כובעים" };
  if (/תחתוני|בוקסר|\b(?:boxers?|underwear)\b/.test(text)) return { parentId: "acc", sub: "הלבשה תחתונה" };
  if (/חליפ[תה] גשם|\brain suit\b/.test(text)) return { parentId: "winter", sub: "חליפות גשם" };
  if (/מעיל|סופט\s*של|\b(?:soft[\s-]*shell|jackets?|parkas?)\b/.test(text)) return redbackPlaces.מעילים;
  if (/קפוצונ|קפוצון|סווטשירט|\b(?:hoodies?|sweatshirts?)\b/.test(text)) return { parentId: "winter", sub: "סווטשירטים וקפוצ'ונים" };
  if (!types.has("גרביים") && /תרמי|טרמי|\b(?:thermal|base[\s-]*layer)\b/.test(text))
    return { parentId: "winter", sub: "ביגוד תרמי" };
  if (/שרוול ארוך|חולצ[תה] פליז|\b(?:long[\s-]*sleeve|fleece shirt)\b/.test(text))
    return { parentId: "winter", sub: "חולצות ארוכות" };
  if (/מכנס|דגמח|\b(?:pants|trousers|shorts|cargo|convertible)\b/.test(text)) return redbackPlaces.מכנסיים;
  if (/חולצ|טישירט|\b(?:shirts?|polo|tees?)\b/.test(text)) return redbackPlaces.חולצות;
  if (/ללא (?:כיפת )?מגן|\bsoft toe\b/.test(text)) return { parentId: "shoes", sub: "נעלי עבודה ללא מגן" };
  if (/כיפת מגן|נעל(?:י|יים)? בטיחות|\bsafety (?:boots?|shoes?)\b/.test(text)) return { parentId: "shoes", sub: "נעלי בטיחות" };
  if (/נעל|מג(?:ף|פ)|\b(?:shoes?|boots?)\b/.test(text)) return { parentId: "shoes", sub: "" };
  const type = redbackTypes.find(entry => types.has(entry));
  return type && redbackPlaces[type];
}

function categoryCollectionTitles(parent: { id: string; name: string }) {
  return parent.id === outdoorFootwear.id ? [parent.name, legacyWorkFootwearCategoryName] : [parent.name];
}

function titled(collections: CollectionLabel[], titles: string[]) {
  const keys = new Set(titles.map(norm));
  return collections.filter((collection) => keys.has(norm(collection.title))).map((collection) => collection.handle);
}

function imageFor(collections: ShopifyCollection[], title: string) {
  return collections.find((collection) => norm(collection.title) === norm(title))?.image?.url ?? null;
}

function norm(value: string) {
  return value
    .toLowerCase()
    .replace(/[''`׳״"“”]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function place(product: Product, placement: Placement) {
  const cats = new Set((product.cats ?? []).filter((id) => id && id !== "shop"));
  cats.add(placement.parentId);
  product.cats = [...cats];
  product.cat = product.cats[0] ?? placement.parentId;
  product.categorySubs ??= {};
  if (!placement.sub) return;
  const categorySubs = new Set(product.categorySubs[placement.parentId]);
  categorySubs.add(placement.sub);
  product.categorySubs[placement.parentId] = [...categorySubs];
  const subs = new Set(product.subs ?? []);
  subs.add(placement.sub);
  product.subs = [...subs];
  product.sub = product.subs[0] ?? placement.sub;
}

async function allCollections() {
  const items = [];
  let after: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await fetchCollectionsPage({ first: PAGE, after });
    items.push(...result.items);
    if (!result.pageInfo.hasNextPage || !result.pageInfo.endCursor) break;
    after = result.pageInfo.endCursor;
  }
  return items;
}

async function allCollectionProducts(handle: string) {
  const items: ShopifyProduct[] = [];
  let after: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await fetchCollectionProductsPage({ handle, first: PAGE, after });
    items.push(...result.products.items);
    if (!result.products.pageInfo.hasNextPage || !result.products.pageInfo.endCursor) break;
    after = result.products.pageInfo.endCursor;
  }
  return items;
}

async function allProducts() {
  const items: ShopifyProduct[] = [];
  let after: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await fetchProductsPage({ first: PAGE, after });
    items.push(...result.items);
    if (!result.pageInfo.hasNextPage || !result.pageInfo.endCursor) break;
    after = result.pageInfo.endCursor;
  }
  return items;
}

function toProduct(product: ShopifyProduct, collectionHandle: string): Product {
  const choices = product.variants.map((variant) => {
    const color = option(variant.selectedOptions, /colou?r|צבע|גוון|גוונים/i) ||
      variant.selectedOptions.find(o => o.name.trim() === "מארזים" && packColors(o.value))?.value || "";
    const sizeOption = option(variant.selectedOptions, /size|מיד(?:ה|ות|ת)|^(?:חגורות עור|scott גרביים)$/i);
    const size = sizeOption || (variant.title === "Default Title" ? "מידה אחת" : color ? "" : variant.title);
    return {
      id: variant.id,
      color,
      size: size || "מידה אחת",
      price: Number(variant.price.amount),
      available: variant.availableForSale,
      image: variant.image?.url || undefined,
      sku: variant.sku || undefined,
    } satisfies VariantChoice;
  });
  const colors = unique(choices.map((choice) => choice.color).filter(Boolean));
  const sizes = unique(choices.map((choice) => choice.size).filter(Boolean));
  const price = Number(product.priceRange.min.amount);
  const compare = product.variants
    .map((variant) => (variant.compareAtPrice ? Number(variant.compareAtPrice.amount) : 0))
    .filter((amount) => amount > price);
  const images = product.images.map((image) => image.url);
  if (!images.length && product.featuredImage) images.push(product.featuredImage.url);
  return {
    id: product.handle,
    name: product.title,
    publishedAt: product.publishedAt,
    cat: collectionHandle,
    cats: collectionHandle === "shop" ? [] : [collectionHandle],
    sub: "",
    price,
    was: compare.length ? Math.max(...compare) : undefined,
    colors,
    sizes: sizes.length ? sizes : ["מידה אחת"],
    sku: choices.find((choice) => choice.sku)?.sku,
    brand: productBrand(product),
    imgs: images,
    desc: product.description.split(/\n+/).map((line) => line.trim()).filter(Boolean),
    choices,
  };
}

function option(options: { name: string; value: string }[], pattern: RegExp) {
  return options.find(item => pattern.test(item.name.normalize("NFKC").trim()))?.value ?? "";
}

function unique(values: string[]) {
  return [...new Set(values)];
}

async function pool<T>(items: T[], limit: number, run: (item: T) => Promise<void>) {
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      await run(current);
    }
  });
  await Promise.all(workers);
}

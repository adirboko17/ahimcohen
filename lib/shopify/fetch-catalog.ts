import "server-only";
import { CATS, productSubcategories, type Product, type VariantChoice } from "@/lib/catalog";
import type { CategorySources } from "@/lib/category-sorting";
import { readAdminStore } from "@/lib/admin/storage";
import {
  legacyWorkFootwearCategoryName, outdoorFootwear, storefrontCategories, storefrontCategoryPlacements,
  socksAndUnderwear, storefrontSubcategory, storefrontSubcategoryLabelsFor, winterOuterwear, type CategoryPlacement,
} from "@/lib/category-placement";
import { packColors } from "@/lib/colors";
import { fetchCollectionsPage } from "./collections";
import { fetchProductCollectionsPage, fetchProductsPage } from "./products";
import type { ShopifyCollection, ShopifyPage, ShopifyProduct } from "./types";
import type { ShopCatalog } from "./load-catalog";
import { productBrand } from "./product-brand";

const PAGE = 50;

type Placement = { parentId: string; sub: string };
type RedbackType = "גרביים" | "חגורות" | "מעילים" | "מכנסיים" | "חולצות";
const redbackPlaces: Record<RedbackType, Placement> = {
  גרביים: { parentId: socksAndUnderwear.parentId, sub: socksAndUnderwear.previous[0] },
  חגורות: { parentId: "acc", sub: "חגורות" },
  מעילים: { parentId: winterOuterwear.parentId, sub: winterOuterwear.previous[0] },
  מכנסיים: { parentId: "pro", sub: "מכנסיים" },
  חולצות: { parentId: "pro", sub: "חולצות" },
};
const redbackTypes = Object.keys(redbackPlaces) as RedbackType[];

export async function fetchShopCatalog(): Promise<ShopCatalog> {
  const [collections, store, items] = await Promise.all([
    collectPages(after => fetchCollectionsPage({ first: PAGE, after })),
    readAdminStore(),
    collectPages(after => fetchProductsPage({ first: PAGE, after, includeCollections: true })),
  ]);
  const collectionOrder = new Map(collections.map(({ handle }, index) => [handle, index]));
  const redbackCollections = new Map(collections.map(({ handle, title }) => [handle, redbackCollectionType(title)]));
  const custom = store.categoryPlacements ?? [];
  const placements = menuPlacements(collections, custom, true);
  const merged = new Map<string, Product>();
  const categorySources = Object.create(null) as CategorySources;
  const redbackItems = new Map<string, { name: string; types: Set<RedbackType> }>();

  function trackRedback(item: ShopifyProduct, product: Product, collectionType?: RedbackType | "") {
    if (collectionType === undefined && norm(product.brand ?? "") !== "redback") return;
    const evidence = redbackItems.get(item.handle) ??
      { name: [item.title, item.productType].filter(Boolean).join(" "), types: new Set<RedbackType>() };
    if (collectionType) evidence.types.add(collectionType);
    redbackItems.set(item.handle, evidence);
  }

  const remainingMemberships = new Map<string, string[]>();
  await pool(items.filter(item => item.collections?.pageInfo.hasNextPage), 3, async item => {
    const memberships = item.collections!;
    const cursor = memberships.pageInfo.endCursor;
    if (!cursor) throw new Error("Shopify returned no cursor for the remaining product collections.");
    remainingMemberships.set(item.id, await collectPages(after => fetchProductCollectionsPage(item.id, after), cursor));
  });

  for (const item of items) {
    const product = toProduct(item, "shop");
    const handles = [...(item.collections?.items ?? []), ...(remainingMemberships.get(item.id) ?? [])]
      .sort((left, right) => (collectionOrder.get(left) ?? Infinity) - (collectionOrder.get(right) ?? Infinity));
    trackRedback(item, product);
    const source = { id: item.id, direct: [] as string[] };
    for (const handle of handles) {
      for (const placement of placements.get(handle) ?? []) {
        place(product, placement);
        if (!placement.sub && !source.direct.includes(placement.parentId)) source.direct.push(placement.parentId);
      }
      const redbackType = redbackCollections.get(handle);
      if (redbackType !== undefined) trackRedback(item, product, redbackType);
    }
    categorySources[item.handle] = source;
    merged.set(item.handle, product);
  }

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
    const placedSubs = new Set(owned.flatMap(product => productSubcategories(product, parent.id)
      .map(sub => storefrontSubcategory(parent.id, sub))));
    const subs = parent.subs.filter(name => placedSubs.has(name));
    const image =
      categoryCollectionTitles(parent).map(title => imageFor(collections, title)).find(Boolean) ??
      subs.flatMap(sub => storefrontSubcategoryLabelsFor(parent.id, sub)).map(title => imageFor(collections, title)).find(Boolean) ??
      null;
    return [{ id: parent.id, name: parent.name, subs, image }];
  });

  return { categories, products, categorySources };
}

type CollectionLabel = Pick<ShopifyCollection, "handle" | "title"> & Partial<Pick<ShopifyCollection, "id">>;

export function menuPlacements(collections: CollectionLabel[], custom: CategoryPlacement[] = [], preserveOriginalSubcategories = false) {
  const placements = new Map<string, Placement[]>();
  const explicit = new Set(custom.map(rule => rule.collectionId));
  const implicit = collections.filter(collection =>
    !explicit.has(collection.id ?? "") || !/^ahim-category-[a-f0-9]{24}$/.test(collection.handle));
  const add = (handle: string, parentId: string, label: string) => {
    const sub = preserveOriginalSubcategories ? label : storefrontSubcategory(parentId, label);
    const list = placements.get(handle) ?? [];
    if (!list.some((item) => item.parentId === parentId && item.sub === sub)) list.push({ parentId, sub });
    placements.set(handle, list);
  };

  for (const parent of CATS) {
    for (const sub of parent.subs) {
      for (const title of storefrontSubcategoryLabelsFor(parent.id, sub)) {
        const label = storefrontSubcategory(parent.id, title) === sub ? title : sub;
        for (const handle of titled(implicit, [title])) add(handle, parent.id, label);
      }
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
  if (/תחתוני|בוקסר|\b(?:boxers?|underwear)\b/.test(text)) return { parentId: socksAndUnderwear.parentId, sub: socksAndUnderwear.previous[1] };
  if (/חליפ[תה] גשם|\brain suit\b/.test(text)) return { parentId: "winter", sub: "חליפות גשם" };
  if (/מעיל|סופט\s*של|\b(?:soft[\s-]*shell|jackets?|parkas?)\b/.test(text)) return redbackPlaces.מעילים;
  if (/קפוצונ|קפוצון|סווטשירט|\b(?:hoodies?|sweatshirts?)\b/.test(text)) return { parentId: winterOuterwear.parentId, sub: winterOuterwear.previous[1] };
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

async function collectPages<T>(load: (after: string | null) => Promise<ShopifyPage<T>>, after: string | null = null) {
  const items: T[] = [];
  const cursors = new Set([after]);
  while (true) {
    const { items: page, pageInfo } = await load(after);
    items.push(...page);
    if (!pageInfo.hasNextPage) return items;
    after = pageInfo.endCursor;
    if (!after || cursors.has(after)) throw new Error("Shopify catalog pagination did not advance.");
    cursors.add(after);
  }
}

function toProduct(product: ShopifyProduct, collectionHandle: string): Product {
  const choices = product.variants.map((variant) => {
    const colorOption = option(variant.selectedOptions, /colou?r|צבע|גוון|גוונים/i) ||
      variant.selectedOptions.find(o => o.name.trim() === "מארזים" && packColors(o.value));
    const sizeOption = option(variant.selectedOptions, /size|מיד(?:ה|ות|ת)|^(?:חגורות עור|scott גרביים)$/i);
    const color = colorOption?.value || "";
    const size = sizeOption?.value || (variant.title === "Default Title" ? "מידה אחת" : color ? "" : variant.title);
    const optionsLabel = variant.selectedOptions.some((entry) => entry !== colorOption && entry !== sizeOption && entry.value !== "Default Title")
      ? variant.selectedOptions.map(({ name, value }) => `${name} ${value}`).join(" · ") : undefined;
    return {
      id: variant.id,
      color,
      size: size || "מידה אחת",
      price: Number(variant.price.amount),
      available: variant.availableForSale,
      image: variant.image?.url || undefined,
      sku: variant.sku || undefined,
      ...(optionsLabel && { optionsLabel }),
    } satisfies VariantChoice;
  });
  const colors = unique(choices.map((choice) => choice.color).filter(Boolean));
  const sizes = unique(choices.map((choice) => choice.size).filter(Boolean));
  let price = Number(product.priceRange.min.amount);
  if (price === 0 && /^(?:ahim-redback-|ahim-[a-f0-9]{16}-)/.test(product.handle) &&
    !choices.some(choice => choice.available && choice.price === 0)) {
    const positive = choices.filter(choice => choice.price > 0);
    const available = positive.filter(choice => choice.available);
    const priced = available.length ? available : positive;
    if (priced.length) price = Math.min(...priced.map(choice => choice.price));
  }
  const compare = product.variants
    .map((variant) => (variant.compareAtPrice ? Number(variant.compareAtPrice.amount) : 0))
    .filter((amount) => amount > price);
  const images = product.images.map((image) => image.url);
  if (!images.length && product.featuredImage) images.push(product.featuredImage.url);
  return {
    id: product.handle,
    shopifyProductId: product.id,
    shopifyVendor: product.vendor,
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
  return options.find(item => item.value && pattern.test(item.name.normalize("NFKC").trim()));
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

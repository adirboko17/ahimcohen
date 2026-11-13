import "server-only";
import { CATS, type Product, type VariantChoice } from "@/lib/catalog";
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

export async function fetchShopCatalog(): Promise<ShopCatalog> {
  const collections = await allCollections();
  const placements = menuPlacements(collections);
  const merged = new Map<string, Product>();

  await pool(collections, 3, async (collection) => {
    const pages = await allCollectionProducts(collection.handle);
    for (const item of pages) {
      const existing = merged.get(item.handle);
      const product = existing ?? toProduct(item, "shop");
      for (const placement of placements.get(collection.handle) ?? []) place(product, placement);
      if (!existing) merged.set(item.handle, product);
    }
  });

  if (merged.size === 0) {
    for (const item of await allProducts()) merged.set(item.handle, toProduct(item, "shop"));
  }

  // Some published branded products have no collection. Fetch only the missing
  // audited handles live so their brand links and product pages remain complete.
  const missing = verifiedBrandHandles.filter(handle => !merged.has(handle));
  const batches = Array.from({ length: Math.ceil(missing.length / 10) }, (_, index) => missing.slice(index * 10, index * 10 + 10));
  await pool(batches, 3, async handles => {
    for (const item of await fetchProductsByHandles(handles)) merged.set(item.handle, toProduct(item, "shop"));
  });

  const products = [...merged.values()];
  const categories = CATS.flatMap((parent) => {
    const owned = products.filter((product) => (product.cats ?? [product.cat]).includes(parent.id));
    if (!owned.length) return [];
    const subs = parent.subs.filter((name) => owned.some((product) => (product.subs ?? []).includes(name)));
    const image =
      imageFor(collections, parent.name) ??
      subs.map((name) => imageFor(collections, name)).find(Boolean) ??
      null;
    return [{ id: parent.id, name: parent.name, subs, image }];
  });

  return { categories, products };
}

function menuPlacements(collections: ShopifyCollection[]) {
  const placements = new Map<string, { parentId: string; sub: string }[]>();
  const claimed = new Set<string>();
  const add = (handle: string, parentId: string, sub: string) => {
    const list = placements.get(handle) ?? [];
    if (!list.some((item) => item.parentId === parentId && item.sub === sub)) list.push({ parentId, sub });
    placements.set(handle, list);
  };

  for (const parent of CATS) {
    for (const sub of parent.subs) {
      const handles =
        parent.id === "redback"
          ? [...new Set([...redbackHandles(collections, sub), ...titled(collections, [sub])])]
              .filter((handle) => !claimed.has(handle))
          : titled(collections, [sub, ...(SUB_ALIASES[sub] ?? [])]);
      if (!handles.length) continue;
      for (const handle of handles) {
        if (parent.id !== "redback") claimed.add(handle);
        add(handle, parent.id, sub);
      }
    }
    for (const handle of titled(collections, [parent.name])) add(handle, parent.id, "");
  }
  return placements;
}

function redbackHandles(collections: ShopifyCollection[], sub: string) {
  const exact = norm(`REDBACK ${sub}`);
  const doubled = norm(`REDBACK ${sub} ${sub}`);
  return collections.filter((collection) => {
    const title = norm(collection.title);
    return title === exact || title === doubled;
  }).map((collection) => collection.handle);
}

function titled(collections: ShopifyCollection[], titles: string[]) {
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

function place(product: Product, placement: { parentId: string; sub: string }) {
  const cats = new Set((product.cats ?? []).filter((id) => id && id !== "shop"));
  cats.add(placement.parentId);
  product.cats = [...cats];
  product.cat = product.cats[0] ?? placement.parentId;
  if (!placement.sub) return;
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
    const color = option(variant.selectedOptions, /color|colour|צבע/i);
    const sizeOption = option(variant.selectedOptions, /size|מידה/i);
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
  return options.find((item) => pattern.test(item.name))?.value ?? "";
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

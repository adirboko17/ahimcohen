import "server-only";
import type { SourceCategory, ShopifyIndex, Site } from "./catalog-model";
import type { SupplierProduct, SupplierVariant } from "./redback";
import { sourceReader } from "./public-source";

type Reader = Awaited<ReturnType<typeof sourceReader>>;
type PageInfo = { hasNextPage: boolean; endCursor: string | null };
type Connection<T> = { nodes: T[]; pageInfo: PageInfo };
type Money = { amount: string; currencyCode: string };
const pageInfo = "pageInfo { hasNextPage endCursor }";

async function query(read: Reader, document: string, variables: Record<string, unknown>) {
  const { data } = await read("/api/2026-10/graphql.json", { query: document, variables });
  if (data?.errors?.length || !data?.data) throw new Error("ממשק הקטלוג הציבורי של Shopify לא החזיר תשובה מלאה.");
  return data.data;
}
function numericId(gid: string, kind: string) {
  const prefix = "gid://shopify/" + kind + "/";
  if (typeof gid !== "string" || !gid.startsWith(prefix) || !/^\d+$/.test(gid.slice(prefix.length)))
    throw new Error("מזהה מקור לא תקין.");
  return gid.slice(prefix.length);
}
function nextCursor<T>(connection: Connection<T>, previous: string | null) {
  if (!Array.isArray(connection?.nodes) || typeof connection.pageInfo?.hasNextPage !== "boolean")
    throw new Error("רשימת המקור חלקית.");
  if (!connection.pageInfo.hasNextPage) return null;
  const cursor = connection.pageInfo.endCursor;
  if (!cursor || cursor === previous || !connection.nodes.length) throw new Error("עימוד הקטלוג לא התקדם.");
  return cursor;
}
export async function discoverShopify(read: Reader) {
  const categories: SourceCategory[] = [];
  let after: string | null = null;
  let currency: string;
  do {
    const data = await query(read,`query SupplierCollections($after:String) {
      localization { country { currency { isoCode } } }
      collections(first:100,after:$after) { nodes { id title handle } ${pageInfo} }
    }`,{after});
    currency = data.localization?.country?.currency?.isoCode;
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error("לא ניתן לזהות את מטבע הספק.");
    after = nextCursor(data.collections, after);
    for (const c of data.collections.nodes) categories.push({
      id:numericId(c.id,"Collection"), parent:"0", handle:c.handle, name:c.title, count:-1
    });
  } while (after);
  return { platform:"shopify" as const, currency, categories };
}

export async function indexShopifyPage(read: Reader, site: Site) {
  const groups: (SourceCategory | null)[] = site.pull_all
    ? [null,...site.categories] : site.categories.filter(c => site.selection.includes(c.id));
  const group = groups[site.index_group];
  if (group === undefined) throw new Error("רשימת האוספים השתנתה במהלך המשיכה.");
  const after = site.index_page > 1 ? site.source_cursor : null;
  const fields = `products(first:100,after:$after,sortKey:ID){ nodes{id handle featuredImage{url}} ${pageInfo} }`;
  const data = group ? await query(read,`query Group($id:ID!, $after:String){ collection(id:$id){ ${fields} } }`,
    {id:"gid://shopify/Collection/"+group.id,after}) :
    await query(read,`query All($after:String){ ${fields} }`,{after});
  const connection = group ? data.collection?.products : data.products;
  const cursor = nextCursor(connection,after);
  const index: ShopifyIndex = { ...site.source_index };
  for (const p of connection.nodes) {
    const id = numericId(p.id,"Product");
    const entry = index[id] || {handle:p.handle, categories:[]};
    const image = reviewImage(p.featuredImage?.url, site.domain);
    if (image) entry.image = image;
    if (group && !entry.categories.includes(group.id)) entry.categories.push(group.id);
    index[id] = entry;
  }
  const index_group = site.index_group + (cursor ? 0 : 1);
  return { source_index:index, index_group, index_page:cursor ? site.index_page+1 : 1, source_cursor:cursor,
    phase:index_group >= groups.length ? "catalog" as const : "index" as const };
}

type SourceVariant = {id:string; sku:string|null; availableForSale:boolean; currentlyNotInStock:boolean;
  price:Money; compareAtPrice:Money|null; selectedOptions:{name:string;value:string}[]; image:{url:string}|null};
const productFields = `id title handle vendor description requiresSellingPlan options { name values }
  variants(first:100,after:$variants) @include(if:$getVariants) {
    nodes { id sku availableForSale currentlyNotInStock selectedOptions{name value} price{amount currencyCode}
      compareAtPrice{amount currencyCode} image{url} } ${pageInfo}
  }
  images(first:100,after:$images) @include(if:$getImages) { nodes{url} ${pageInfo} }`;
function imageUrl(value: string, domain: string) {
  const u = new URL(value);
  if (u.protocol !== "https:" || u.port || u.username || u.password ||
    (u.hostname !== domain && u.hostname !== "cdn.shopify.com")) throw new Error("כתובת תמונת המוצר אינה נתמכת.");
  return u.href;
}

function reviewImage(value: string | undefined, domain: string) {
  if (!value) return;
  try { return imageUrl(value, domain); } catch { return undefined; }
}

export async function shopifyReviewImages(read: Reader, domain: string, ids: string[]) {
  const { nodes } = await query(read, `query ReviewImages($ids:[ID!]!) {
    nodes(ids:$ids) { ... on Product { id featuredImage { url } } }
  }`, { ids: ids.map(id => "gid://shopify/Product/" + id) });
  const images: Record<string, string> = {};
  for (const product of nodes) {
    if (!product?.featuredImage?.url) continue;
    const id = numericId(product.id, "Product");
    if (!ids.includes(id)) continue;
    const image = reviewImage(product.featuredImage.url, domain);
    if (image) images[id] = image;
  }
  return images;
}

export async function readShopifyProduct(read:Reader, domain:string, id:string, currency:string, categories:SourceCategory[]):Promise<SupplierProduct> {
  const variants: SupplierVariant[] = [], images = new Set<string>();
  let vc:string|null=null, ic:string|null=null, getVariants=true, getImages=true;
  let result: SupplierProduct;
  function price(money:Money) {
    if (money?.currencyCode !== currency || !/^\d+(\.\d+)?$/.test(money.amount) || !Number.isFinite(Number(money.amount)))
      throw new Error("לא ניתן לאמת את מחיר המוצר במטבע הספק.");
    return Number(money.amount);
  }
  do {
    const {product:p} = await query(read,`query SupplierProduct($id:ID!, $variants:String, $images:String,
      $getVariants:Boolean!, $getImages:Boolean!){ product(id:$id){${productFields}} }`,
      {id:"gid://shopify/Product/"+id,variants:vc,images:ic,getVariants,getImages});
    if (!p || numericId(p.id,"Product") !== id || p.requiresSellingPlan || !p.handle || !p.options?.length)
      throw new Error("זהות המוצר או אפשרות הרכישה לא אומתה.");
    if (getImages) {
      ic = nextCursor(p.images,ic);
      for (const i of p.images.nodes) images.add(imageUrl(i.url, domain));
      getImages = !!ic;
    }
    if (getVariants) {
      vc = nextCursor(p.variants,vc);
      for (const v of p.variants.nodes as SourceVariant[]) {
        if (typeof v.availableForSale !== "boolean" || typeof v.currentlyNotInStock !== "boolean" ||
          v.selectedOptions?.length !== p.options.length ||
          !p.options.every((o:{name:string;values:string[]})=>v.selectedOptions.some(s=>s.name===o.name && o.values.includes(s.value))))
          throw new Error("לא ניתן לאמת את הזמינות או האפשרויות של וריאציה.");
        const src = v.image ? imageUrl(v.image.url, domain) : "";
        variants.push({ id:numericId(v.id,"ProductVariant"),sku:v.sku || "",
          options:Object.fromEntries(v.selectedOptions.map(s=>[s.name,s.value])), available:v.availableForSale && !v.currentlyNotInStock,
          price:price(v.price),regular:price(v.compareAtPrice || v.price),image:src });
      }
      getVariants = !!vc;
    }
    result = {id, domain, platform:"shopify", url:"https://"+domain+"/products/"+encodeURIComponent(decodeURIComponent(p.handle)),
      title:p.title, brand:p.vendor || "", currency, attributes:p.options.map((o:{name:string;values:string[]})=>({name:o.name,values:o.values})),
      description:[p.description].filter(Boolean),categoryIds:categories.map(c=>c.id),category:categories.map(c=>c.name).join(" · "),images:[],variants};
  } while (getImages || getVariants);
  if (!images.size || !variants.length || new Set(variants.map(v=>v.id)).size !== variants.length ||
      new Set(variants.map(v=>JSON.stringify(Object.entries(v.options).sort()))).size !== variants.length)
    throw new Error("רשימת התמונות או הווריאציות אינה מלאה.");
  const firstImage = images.values().next().value!;
  for (const v of variants) { v.image ||= firstImage; images.add(v.image); }
  result.images = [...images];
  return result;
}
export async function rescanShopify(p: SupplierProduct) {
  const fresh=await readShopifyProduct(await sourceReader(p.domain!),p.domain!,p.id,p.currency!,[]);
  return {...fresh,category:p.category,categoryIds:p.categoryIds};
}

import "server-only";
import { storefront, withStorefrontFallback } from "./client";
import { metafieldIdentifiers, ShopifyError } from "./config";
import { collectionProductsQuery, productsQuery, VARIANTS_BY_SKU_QUERY } from "./operations";
import type {
  ShopifyImage,
  ShopifyMetafield,
  ShopifyMoney,
  ShopifyPage,
  ShopifyProduct,
  ShopifyVariant,
} from "./types";

type RawMoney = { amount?: string | null; currencyCode?: string | null } | null;
type RawImage = { url?: string | null; altText?: string | null; width?: number | null; height?: number | null } | null;
type RawMetafield = { namespace?: string | null; key?: string | null; value?: string | null; type?: string | null } | null;
type RawVariant = {
  id: string;
  title: string;
  sku?: string | null;
  availableForSale: boolean;
  currentlyNotInStock?: boolean;
  quantityAvailable?: number | null;
  selectedOptions?: { name: string; value: string }[];
  price: RawMoney;
  compareAtPrice?: RawMoney;
  image?: RawImage;
  metafields?: RawMetafield[];
};
type RawProduct = {
  id: string;
  handle: string;
  title: string;
  description?: string | null;
  productType?: string | null;
  vendor?: string | null;
  availableForSale: boolean;
  featuredImage?: RawImage;
  images?: { nodes?: RawImage[] };
  priceRange: { minVariantPrice: RawMoney; maxVariantPrice: RawMoney };
  metafields?: RawMetafield[];
  variants?: { nodes?: RawVariant[] };
};
type ProductConnection = {
  products: {
    pageInfo: { hasNextPage: boolean; endCursor?: string | null };
    nodes: RawProduct[];
  };
};

export async function fetchProductsPage(input: {
  first?: number;
  after?: string | null;
  query?: string | null;
  buyerIp?: string;
}): Promise<ShopifyPage<ShopifyProduct>> {
  const first = clampFirst(input.first, 20);
  const identifiers = metafieldIdentifiers();
  const variables = {
    first,
    after: input.after || null,
    query: input.query || null,
    identifiers,
  };
  const data = await withStorefrontFallback(
    (flags) =>
      storefront<ProductConnection>(
        productsQuery(flags.inventory, flags.metafields),
        flags.metafields ? variables : { first, after: variables.after, query: variables.query },
        input.buyerIp,
      ),
    identifiers.length > 0,
  );
  return {
    items: data.products.nodes.map(mapProduct),
    pageInfo: {
      hasNextPage: data.products.pageInfo.hasNextPage,
      endCursor: data.products.pageInfo.endCursor ?? null,
    },
  };
}

export async function fetchCollectionProductsPage(input: {
  handle: string;
  first?: number;
  after?: string | null;
  buyerIp?: string;
}): Promise<{ collection: { id: string; handle: string; title: string } | null; products: ShopifyPage<ShopifyProduct> }> {
  const handle = input.handle.trim();
  if (!handle || /[\s/?#\\]/.test(handle)) throw new ShopifyError("Invalid collection handle.", 400);
  const first = clampFirst(input.first, 20);
  const identifiers = metafieldIdentifiers();
  const data = await withStorefrontFallback(
    (flags) =>
      storefront<{
        collection: {
          id: string;
          handle: string;
          title: string;
          products: ProductConnection["products"];
        } | null;
      }>(
        collectionProductsQuery(flags.inventory, flags.metafields),
        {
          handle,
          first,
          after: input.after || null,
          ...(flags.metafields ? { identifiers } : {}),
        },
        input.buyerIp,
      ),
    identifiers.length > 0,
  );
  if (!data.collection) {
    return { collection: null, products: { items: [], pageInfo: { hasNextPage: false, endCursor: null } } };
  }
  return {
    collection: { id: data.collection.id, handle: data.collection.handle, title: data.collection.title },
    products: {
      items: data.collection.products.nodes.map(mapProduct),
      pageInfo: {
        hasNextPage: data.collection.products.pageInfo.hasNextPage,
        endCursor: data.collection.products.pageInfo.endCursor ?? null,
      },
    },
  };
}

export async function findVariantForSelection(input: {
  sku: string;
  color: string;
  size: string;
  buyerIp?: string;
}) {
  const sku = input.sku.trim();
  const data = await storefront<{
    products: { nodes: { title: string; variants: { nodes: { id: string; sku?: string | null; title: string; availableForSale: boolean; selectedOptions?: { name: string; value: string }[] }[] } }[] };
  }>(VARIANTS_BY_SKU_QUERY, { query: `sku:"${sku.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` }, input.buyerIp);

  const matches = data.products.nodes.flatMap((product) =>
    product.variants.nodes
      .filter((variant) => (variant.sku ?? "").trim() === sku)
      .map((variant) => ({ ...variant, productTitle: product.title })),
  );
  if (matches.length === 0) return null;
  const refined = matches.filter((variant) =>
    hasOption(variant.selectedOptions ?? [], input.size) && hasOption(variant.selectedOptions ?? [], input.color),
  );
  if (refined.length === 1) return refined[0];
  if (matches.length === 1) return matches[0];
  return null;
}

function hasOption(options: { name: string; value: string }[], wanted: string) {
  const needle = wanted.trim().toLowerCase().replace(/^eu\s+/, "");
  if (!needle) return true;
  return options.some((option) => option.value.trim().toLowerCase().replace(/^eu\s+/, "") === needle);
}

function mapProduct(product: RawProduct): ShopifyProduct {
  const min = money(product.priceRange.minVariantPrice);
  const max = money(product.priceRange.maxVariantPrice);
  if (!min || !max) throw new ShopifyError("Shopify product is missing a price.");
  return {
    id: product.id,
    handle: product.handle,
    title: product.title,
    description: product.description ?? "",
    productType: product.productType ?? "",
    vendor: product.vendor ?? "",
    availableForSale: product.availableForSale,
    featuredImage: image(product.featuredImage),
    images: (product.images?.nodes ?? []).map(image).filter((item): item is ShopifyImage => item !== null),
    priceRange: { min, max },
    metafields: metafields(product.metafields),
    variants: (product.variants?.nodes ?? []).map(mapVariant),
  };
}

function mapVariant(variant: RawVariant): ShopifyVariant {
  const price = money(variant.price);
  if (!price) throw new ShopifyError("Shopify variant is missing a price.");
  return {
    id: variant.id,
    title: variant.title,
    sku: variant.sku ?? null,
    availableForSale: variant.availableForSale,
    currentlyNotInStock: variant.currentlyNotInStock ?? false,
    quantityAvailable: typeof variant.quantityAvailable === "number" ? variant.quantityAvailable : null,
    selectedOptions: variant.selectedOptions ?? [],
    price,
    compareAtPrice: money(variant.compareAtPrice),
    image: image(variant.image),
    metafields: metafields(variant.metafields),
  };
}

function money(value: RawMoney | undefined): ShopifyMoney | null {
  if (!value?.amount || !value.currencyCode) return null;
  return { amount: value.amount, currencyCode: value.currencyCode };
}

function image(value: RawImage | undefined): ShopifyImage | null {
  if (!value?.url) return null;
  return {
    url: value.url,
    altText: value.altText ?? null,
    width: value.width ?? null,
    height: value.height ?? null,
  };
}

function metafields(values: RawMetafield[] | undefined): ShopifyMetafield[] {
  return (values ?? []).flatMap((field) => {
    if (!field?.namespace || !field.key || field.value == null || !field.type) return [];
    return [{ namespace: field.namespace, key: field.key, value: field.value, type: field.type }];
  });
}

export function clampFirst(value: number | undefined, fallback: number) {
  if (!value || !Number.isInteger(value) || value < 1) return fallback;
  return Math.min(value, 50);
}

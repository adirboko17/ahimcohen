import "server-only";
import { storefront } from "./client";
import { COLLECTIONS_QUERY } from "./operations";
import type { ShopifyCollection, ShopifyImage, ShopifyPage } from "./types";

type RawImage = { url?: string | null; altText?: string | null; width?: number | null; height?: number | null } | null;
type RawCollection = {
  id: string;
  handle: string;
  title: string;
  description?: string | null;
  image?: RawImage;
};

export async function fetchCollectionsPage(input: {
  first?: number;
  after?: string | null;
  buyerIp?: string;
}): Promise<ShopifyPage<ShopifyCollection>> {
  const first = input.first && Number.isInteger(input.first) && input.first > 0 ? Math.min(input.first, 50) : 20;
  const data = await storefront<{
    collections: {
      pageInfo: { hasNextPage: boolean; endCursor?: string | null };
      nodes: RawCollection[];
    };
  }>(COLLECTIONS_QUERY, { first, after: input.after || null }, input.buyerIp);

  return {
    items: data.collections.nodes.map((collection) => ({
      id: collection.id,
      handle: collection.handle,
      title: collection.title,
      description: collection.description ?? "",
      image: image(collection.image),
    })),
    pageInfo: {
      hasNextPage: data.collections.pageInfo.hasNextPage,
      endCursor: data.collections.pageInfo.endCursor ?? null,
    },
  };
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

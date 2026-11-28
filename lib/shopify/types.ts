export type ShopifyMoney = {
  amount: string;
  currencyCode: string;
};

export type ShopifyImage = {
  url: string;
  altText: string | null;
  width: number | null;
  height: number | null;
};

export type ShopifyMetafield = {
  namespace: string;
  key: string;
  value: string;
  type: string;
};

export type ShopifySelectedOption = {
  name: string;
  value: string;
};

export type ShopifyVariant = {
  id: string;
  title: string;
  sku: string | null;
  availableForSale: boolean;
  currentlyNotInStock: boolean;
  quantityAvailable: number | null;
  selectedOptions: ShopifySelectedOption[];
  price: ShopifyMoney;
  compareAtPrice: ShopifyMoney | null;
  image: ShopifyImage | null;
  metafields: ShopifyMetafield[];
};

export type ShopifyProduct = {
  id: string;
  handle: string;
  title: string;
  publishedAt: string;
  description: string;
  productType: string;
  vendor: string;
  availableForSale: boolean;
  featuredImage: ShopifyImage | null;
  images: ShopifyImage[];
  priceRange: { min: ShopifyMoney; max: ShopifyMoney };
  metafields: ShopifyMetafield[];
  variants: ShopifyVariant[];
  collections?: ShopifyPage<string>;
};

export type ShopifyCollection = {
  id: string;
  handle: string;
  title: string;
  description: string;
  image: ShopifyImage | null;
};

export type ShopifyPageInfo = {
  hasNextPage: boolean;
  endCursor: string | null;
};

export type ShopifyPage<T> = {
  items: T[];
  pageInfo: ShopifyPageInfo;
};

export type ShopifyCartLine = {
  id: string;
  quantity: number;
  subtotal: ShopifyMoney | null;
  total: ShopifyMoney | null;
  merchandiseId: string | null;
  title: string | null;
};

export type ShopifyCart = {
  analytics?: import("@shopify/hydrogen").AnalyticsCart;
  id: string;
  checkoutUrl: string;
  totalQuantity: number;
  subtotal: ShopifyMoney | null;
  total: ShopifyMoney | null;
  lines: ShopifyCartLine[];
};

export type MetafieldIdentifier = {
  namespace: string;
  key: string;
};

export type CartLineDraft = {
  merchandiseId: string;
  quantity: number;
  configurationKey?: string;
  attributes?: { key: string; value: string }[];
};

export type CartLineUpdate = {
  id: string;
  quantity: number;
};

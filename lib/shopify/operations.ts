const MONEY = `amount currencyCode`;
const IMAGE = `url altText width height`;
const METAFIELD = `namespace key value type`;

function variantFields(inventory: boolean, metafields: boolean) {
  return `
    id
    title
    sku
    availableForSale
    currentlyNotInStock
    ${inventory ? "quantityAvailable" : ""}
    selectedOptions { name value }
    price { ${MONEY} }
    compareAtPrice { ${MONEY} }
    image { ${IMAGE} }
    ${metafields ? `metafields(identifiers: $identifiers) { ${METAFIELD} }` : ""}
  `;
}

function productFields(inventory: boolean, metafields: boolean) {
  return `
    id
    handle
    title
    description
    productType
    vendor
    availableForSale
    featuredImage { ${IMAGE} }
    images(first: 8) { nodes { ${IMAGE} } }
    priceRange {
      minVariantPrice { ${MONEY} }
      maxVariantPrice { ${MONEY} }
    }
    ${metafields ? `metafields(identifiers: $identifiers) { ${METAFIELD} }` : ""}
    variants(first: 100) { nodes { ${variantFields(inventory, metafields)} } }
  `;
}

function identifierVar(metafields: boolean) {
  return metafields ? ", $identifiers: [HasMetafieldsIdentifier!]!" : "";
}

export function productsQuery(inventory: boolean, metafields: boolean) {
  return `query Products($first: Int!, $after: String, $query: String${identifierVar(metafields)}) {
    products(first: $first, after: $after, query: $query) {
      pageInfo { hasNextPage endCursor }
      nodes { ${productFields(inventory, metafields)} }
    }
  }`;
}

export function collectionProductsQuery(inventory: boolean, metafields: boolean) {
  return `query CollectionProducts($handle: String!, $first: Int!, $after: String${identifierVar(metafields)}) {
    collection(handle: $handle) {
      id
      handle
      title
      description
      image { ${IMAGE} }
      products(first: $first, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes { ${productFields(inventory, metafields)} }
      }
    }
  }`;
}

export const COLLECTIONS_QUERY = `query Collections($first: Int!, $after: String) {
  collections(first: $first, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id
      handle
      title
      description
      image { ${IMAGE} }
    }
  }
}`;

export const VARIANTS_BY_SKU_QUERY = `query VariantsBySku($query: String!) {
  products(first: 10, query: $query) {
    nodes {
      title
      variants(first: 100) {
        nodes {
          id
          sku
          title
          availableForSale
          selectedOptions { name value }
        }
      }
    }
  }
}`;

const CART_FIELDS = `
  id
  checkoutUrl
  totalQuantity
  cost {
    subtotalAmount { ${MONEY} }
    totalAmount { ${MONEY} }
  }
  lines(first: 100) {
    nodes {
      id
      quantity
      merchandise {
        ... on ProductVariant {
          id
          title
          product { title }
        }
      }
    }
  }
`;

export const CART_CREATE = `mutation CartCreate($input: CartInput) {
  cartCreate(input: $input) {
    cart { ${CART_FIELDS} }
    userErrors { field message }
  }
}`;

export const CART_LINES_ADD = `mutation CartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
  cartLinesAdd(cartId: $cartId, lines: $lines) {
    cart { ${CART_FIELDS} }
    userErrors { field message }
  }
}`;

export const CART_LINES_UPDATE = `mutation CartLinesUpdate($cartId: ID!, $lines: [CartLineUpdateInput!]!) {
  cartLinesUpdate(cartId: $cartId, lines: $lines) {
    cart { ${CART_FIELDS} }
    userErrors { field message }
  }
}`;

export const CART_LINES_REMOVE = `mutation CartLinesRemove($cartId: ID!, $lineIds: [ID!]!) {
  cartLinesRemove(cartId: $cartId, lineIds: $lineIds) {
    cart { ${CART_FIELDS} }
    userErrors { field message }
  }
}`;

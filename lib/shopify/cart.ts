import "server-only";
import { storefront } from "./client";
import { ShopifyError } from "./config";
import { CART_CREATE, CART_LINES_ADD, CART_LINES_REMOVE, CART_LINES_UPDATE } from "./operations";
import type { CartLineDraft, CartLineUpdate, ShopifyCart, ShopifyCartLine, ShopifyMoney } from "./types";

const VARIANT_ID = /^gid:\/\/shopify\/ProductVariant\/\d+$/;
const CART_ID = /^gid:\/\/shopify\/Cart\/[A-Za-z0-9_-]{8,}$/;
const LINE_ID = /^gid:\/\/shopify\/CartLine\/[A-Za-z0-9_-]{4,}$/;

type RawCart = {
  id: string;
  updatedAt?: string;
  checkoutUrl: string;
  totalQuantity: number;
  cost?: {
    subtotalAmount?: { amount?: string | null; currencyCode?: string | null } | null;
    totalAmount?: { amount?: string | null; currencyCode?: string | null } | null;
  } | null;
  lines?: {
    nodes?: {
      id: string;
      quantity: number;
      cost?: RawCart["cost"];
      merchandise?: import("@shopify/hydrogen").AnalyticsCartLine["merchandise"] | null;
    }[];
  };
};

type CartPayload = {
  cart: RawCart | null;
  userErrors: { field?: string[] | null; message: string }[];
};

export async function createCart(lines: CartLineDraft[], buyerIp?: string, discountCodes: string[] = [], buyerRequest?: Pick<Headers, "get">) {
  const input = { lines: lines.map(toCartLineInput), ...(discountCodes.length ? { discountCodes } : {}) };
  const data = await storefront<{ cartCreate: CartPayload }>(CART_CREATE, { input }, buyerIp, buyerRequest);
  return readCart(data.cartCreate);
}

export async function addCartLines(cartId: string, lines: CartLineDraft[], buyerIp?: string) {
  const data = await storefront<{ cartLinesAdd: CartPayload }>(
    CART_LINES_ADD,
    { cartId: assertId(cartId, CART_ID, "cart"), lines: lines.map(toCartLineInput) },
    buyerIp,
  );
  return readCart(data.cartLinesAdd);
}

export async function updateCartLines(cartId: string, lines: CartLineUpdate[], buyerIp?: string) {
  const updates = lines.map((line) => ({
    id: assertId(line.id, LINE_ID, "cart line"),
    quantity: assertQuantity(line.quantity),
  }));
  const data = await storefront<{ cartLinesUpdate: CartPayload }>(
    CART_LINES_UPDATE,
    { cartId: assertId(cartId, CART_ID, "cart"), lines: updates },
    buyerIp,
  );
  return readCart(data.cartLinesUpdate);
}

export async function removeCartLines(cartId: string, lineIds: string[], buyerIp?: string) {
  const ids = lineIds.map((id) => assertId(id, LINE_ID, "cart line"));
  const data = await storefront<{ cartLinesRemove: CartPayload }>(
    CART_LINES_REMOVE,
    { cartId: assertId(cartId, CART_ID, "cart"), lineIds: ids },
    buyerIp,
  );
  return readCart(data.cartLinesRemove);
}

function toCartLineInput(line: CartLineDraft) {
  return {
    merchandiseId: assertId(line.merchandiseId, VARIANT_ID, "variant"),
    quantity: assertQuantity(line.quantity),
    attributes: (line.attributes ?? [])
      .filter((attribute) => attribute.key.trim() && attribute.value.trim())
      .slice(0, 250)
      .map((attribute) => ({ key: attribute.key.slice(0, 80), value: attribute.value.slice(0, 200) })),
  };
}

function readCart(payload: CartPayload): ShopifyCart {
  if (payload.userErrors?.length) {
    throw new ShopifyError(payload.userErrors.map((error) => error.message).filter(Boolean).join(" "));
  }
  if (!payload.cart?.checkoutUrl) throw new ShopifyError("Shopify did not return a checkout URL.");
  const checkoutUrl = new URL(payload.cart.checkoutUrl);
  if (checkoutUrl.protocol !== "https:") throw new ShopifyError("Shopify returned an invalid checkout URL.");
  return {
    id: payload.cart.id,
    ...(payload.cart.updatedAt && { analytics: {
      // The Shopify cart key and checkout URL must never enter analytics.
      id: payload.cart.id.split("?")[0],
      updatedAt: payload.cart.updatedAt,
      cost: { totalAmount: { currencyCode: payload.cart.cost?.totalAmount?.currencyCode ?? "ILS" } },
      lines: { nodes: (payload.cart.lines?.nodes ?? []).flatMap(line => line.merchandise?.product?.id
        ? [{ id: line.id.split("?")[0], quantity: line.quantity, merchandise: line.merchandise }] : []) },
    } }),
    checkoutUrl: checkoutUrl.toString(),
    totalQuantity: payload.cart.totalQuantity,
    subtotal: money(payload.cart.cost?.subtotalAmount),
    total: money(payload.cart.cost?.totalAmount),
    lines: (payload.cart.lines?.nodes ?? []).map(mapLine),
  };
}

function mapLine(line: NonNullable<NonNullable<RawCart["lines"]>["nodes"]>[number]): ShopifyCartLine {
  const productTitle = line.merchandise?.product?.title;
  const variantTitle = line.merchandise?.title;
  const title = [productTitle, variantTitle && variantTitle !== "Default Title" ? variantTitle : ""]
    .filter(Boolean)
    .join(" · ");
  return {
    id: line.id,
    quantity: line.quantity,
    subtotal: money(line.cost?.subtotalAmount),
    total: money(line.cost?.totalAmount),
    merchandiseId: line.merchandise?.id ?? null,
    title: title || null,
  };
}

function money(value: { amount?: string | null; currencyCode?: string | null } | null | undefined): ShopifyMoney | null {
  if (!value?.amount || !value.currencyCode) return null;
  return { amount: value.amount, currencyCode: value.currencyCode };
}

function assertId(value: string, pattern: RegExp, label: string) {
  const id = value.trim();
  if (!pattern.test(id)) throw new ShopifyError(`Invalid Shopify ${label} id.`, 400);
  return id;
}

function assertQuantity(value: number) {
  if (!Number.isInteger(value) || value < 1 || value > 250) {
    throw new ShopifyError("Quantity must be a whole number from 1 to 250.", 400);
  }
  return value;
}

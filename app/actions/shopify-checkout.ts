"use server";

import { headers } from "next/headers";
import { PM } from "@/lib/catalog";
import { createCart } from "@/lib/shopify/cart";
import { ShopifyError } from "@/lib/shopify/config";
import { findVariantForSelection } from "@/lib/shopify/products";
import type { CartLineDraft } from "@/lib/shopify/types";
import { cartQuote } from "@/lib/cart-quote";
import { checkoutReceipt } from "@/lib/shopify/checkout-status";
import { managedDiscountCodes } from "@/lib/admin/commerce";
import type { PackUnit } from "@/lib/types";

type CheckoutLine = { pid: string; color: string; size: string; qty: number; variantId?: string; packUnits?: PackUnit[] };

export async function beginShopifyCheckout(lines: CheckoutLine[], expectedTotal?: number) {
  const result = await prepareCart(lines, true);
  if (!result.ok) return result;
  if (expectedTotal !== undefined) {
    try {
      const quote = cartQuote(result.cart, result.drafts);
      if (!Number.isFinite(expectedTotal) || Math.abs(quote.total - expectedTotal) > .01) {
        return { ok: false as const, error: "המחיר התעדכן. בדקו את הסכום המעודכן ואשרו שוב את המעבר לתשלום." };
      }
    } catch {
      return { ok: false as const, error: "הכמות או המחיר השתנו. עדכנו את הסל ונסו שוב." };
    }
  }
  return { ok: true as const, checkoutUrl: result.cart.checkoutUrl, receipt: checkoutReceipt(result.cart.id) };
}

export async function quoteShopifyCart(lines: CheckoutLine[], shopperCart = false) {
  const result = await prepareCart(lines, shopperCart);
  if (!result.ok) return result;
  try {
    return { ok: true as const, quote: cartQuote(result.cart, result.drafts) };
  } catch {
    return { ok: false as const, error: "לא ניתן לאמת את המחיר או הכמות המבוקשת. נסו לעדכן את הסל." };
  }
}

async function prepareCart(lines: CheckoutLine[], shopperCart: boolean) {
  try {
    if (!Array.isArray(lines) || lines.length === 0 || lines.length > 50) {
      return { ok: false as const, error: "הסל ריק." };
    }
    const headerList = await headers();
    const buyerIp = headerList.get("x-forwarded-for")?.split(",")[0]?.trim() || headerList.get("x-real-ip")?.trim() || undefined;
    const drafts: CartLineDraft[] = [];
    let resolveQuantityOffer: Awaited<ReturnType<typeof import("@/lib/admin/quantity-offer-cart").quantityOfferCartResolver>> | undefined;
    for (const line of lines) {
      const product = PM[line.pid];
      const qty = Number(line.qty);
      if (!Number.isInteger(qty) || qty < 1 || qty > 250) {
        return { ok: false as const, error: "אחד הפריטים בסל לא זמין." };
      }
      const directId = line.variantId?.trim() ?? "";
      if (line.packUnits !== undefined) {
        resolveQuantityOffer ??= await (await import("@/lib/admin/quantity-offer-cart")).quantityOfferCartResolver();
        const configured = resolveQuantityOffer(line.pid, directId, qty, line.packUnits);
        if (!configured) return { ok: false as const, error: "הרכב המארז השתנה. בחרו שוב את הווריאציה של כל יחידה." };
        drafts.push(configured);
        continue;
      }
      if (/^gid:\/\/shopify\/ProductVariant\/\d+$/.test(directId)) {
        drafts.push({
          merchandiseId: directId,
          quantity: qty,
          attributes: [
            line.color ? { key: "צבע", value: String(line.color).slice(0, 80) } : null,
            line.size ? { key: "מידה", value: String(line.size).slice(0, 80) } : null,
          ].filter((attribute): attribute is { key: string; value: string } => attribute !== null),
        });
        continue;
      }
      if (!product) {
        return { ok: false as const, error: "אחד הפריטים בסל לא זמין." };
      }
      if (!product.sku) {
        return { ok: false as const, error: `למוצר ${product.name} אין מק״ט לחיבור ל-Shopify.` };
      }
      const variant = await findVariantForSelection({
        sku: product.sku,
        color: String(line.color ?? ""),
        size: String(line.size ?? ""),
        buyerIp,
      });
      if (!variant) {
        return { ok: false as const, error: `לא נמצאה ב-Shopify התאמה למק״ט ${product.sku} (${product.name}).` };
      }
      if (!variant.availableForSale) {
        return { ok: false as const, error: `${product.name} לא זמין כרגע לרכישה.` };
      }
      drafts.push({
        merchandiseId: variant.id,
        quantity: qty,
        attributes: [
          line.color ? { key: "צבע", value: String(line.color).slice(0, 80) } : null,
          line.size ? { key: "מידה", value: String(line.size).slice(0, 80) } : null,
        ].filter((attribute): attribute is { key: string; value: string } => attribute !== null),
      });
    }
    const merged = mergeDrafts(drafts);
    const discountCodes = await managedDiscountCodes(merged);
    const cart = await createCart(merged, buyerIp, discountCodes.length ? discountCodes : undefined, shopperCart ? headerList : undefined);
    return { ok: true as const, cart, drafts: merged };
  } catch (error) {
    if (error instanceof ShopifyError) return { ok: false as const, error: hebrewShopifyError(error.message) };
    return { ok: false as const, error: "לא הצלחנו לפתוח את הקופה של Shopify." };
  }
}

function mergeDrafts(lines: CartLineDraft[]) {
  const merged = new Map<string, CartLineDraft>();
  for (const line of lines) {
    const key = line.configurationKey ? JSON.stringify([line.merchandiseId, line.configurationKey]) : line.merchandiseId;
    const current = merged.get(key);
    if (!current) {
      merged.set(key, { ...line, attributes: line.attributes ?? [] });
      continue;
    }
    current.quantity += line.quantity;
  }
  return [...merged.values()];
}

function hebrewShopifyError(message: string) {
  if (/private Storefront token|SHOPIFY_STORE_DOMAIN|SHOPIFY_STOREFRONT/.test(message)) {
    return "חיבור Shopify עדיין לא מוגדר בשרת.";
  }
  if (/refused the/.test(message)) return "Shopify דחה את מפתח הגישה.";
  return "Shopify לא הצליח לפתוח קופה. נסו שוב.";
}

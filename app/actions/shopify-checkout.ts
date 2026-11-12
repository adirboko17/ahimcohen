"use server";

import { headers } from "next/headers";
import { PM } from "@/lib/catalog";
import { createCart } from "@/lib/shopify/cart";
import { ShopifyError } from "@/lib/shopify/config";
import { findVariantForSelection } from "@/lib/shopify/products";
import type { CartLineDraft } from "@/lib/shopify/types";

type CheckoutLine = { pid: string; color: string; size: string; qty: number; variantId?: string };

export async function beginShopifyCheckout(lines: CheckoutLine[]) {
  try {
    if (!Array.isArray(lines) || lines.length === 0 || lines.length > 50) {
      return { ok: false as const, error: "הסל ריק." };
    }
    const headerList = await headers();
    const buyerIp = headerList.get("x-forwarded-for")?.split(",")[0]?.trim() || headerList.get("x-real-ip")?.trim() || undefined;
    const drafts: CartLineDraft[] = [];
    for (const line of lines) {
      const product = PM[line.pid];
      const qty = Number(line.qty);
      if (!Number.isInteger(qty) || qty < 1) {
        return { ok: false as const, error: "אחד הפריטים בסל לא זמין." };
      }
      const directId = line.variantId?.trim() ?? "";
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
    const cart = await createCart(mergeDrafts(drafts), buyerIp);
    return { ok: true as const, checkoutUrl: cart.checkoutUrl };
  } catch (error) {
    if (error instanceof ShopifyError) return { ok: false as const, error: hebrewShopifyError(error.message) };
    return { ok: false as const, error: "לא הצלחנו לפתוח את הקופה של Shopify." };
  }
}

function mergeDrafts(lines: CartLineDraft[]) {
  const merged = new Map<string, CartLineDraft>();
  for (const line of lines) {
    const current = merged.get(line.merchandiseId);
    if (!current) {
      merged.set(line.merchandiseId, { ...line, attributes: line.attributes ?? [] });
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

"use client";

import { AnalyticsEvent, type AnalyticsCart, type AnalyticsCartLine } from "@shopify/hydrogen";
import { ShopifyScripts } from "@shopify/hydrogen/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { useCatalog } from "@/lib/catalog-context";
import type { CartLine } from "@/lib/types";

const market = { country: "IL", language: "HE", currency: "ILS" } as const;

export function StorefrontScripts({ domain, shopId }: { domain: string; shopId: string }) {
  const router = useRouter();
  return <ShopifyScripts shop={{ myshopifyDomain: domain, shopId, storefrontId: "0" }}
    i18n={market} analytics={{ channel: "headless" }} consent={{ mode: "default-banner" }}
    routes={{ product: "/p/:productHandle" }} navigate={url => router.push(url)} webMcp={false} />;
}

export function StorefrontViews() {
  const pathname = usePathname();
  const params = useSearchParams();
  const { product } = useCatalog();
  const lastView = useRef("");
  useEffect(() => {
    const url = new URL(window.location.href);
    // Account callbacks and admin routes can contain private information.
    if (/^\/(admin|account|api)(\/|$)/.test(pathname)) {
      lastView.current = "";
      return;
    }
    const bus = window.Shopify?.analytics;
    if (!bus || lastView.current === url.href) return;
    lastView.current = url.href;
    bus.publish(AnalyticsEvent.PAGE_VIEWED, { url: url.href });
    const match = /^\/p\/([^/]+)\/?$/.exec(pathname);
    if (!match) return;
    const item = product(decodeURIComponent(match[1]));
    const choices = item?.choices ?? [];
    const variant = choices.find(v => v.available && (!params.get("color") || params.get("color") === v.color)
      && (!params.get("size") || params.get("size") === v.size)) ?? choices.find(v => v.available) ?? choices[0];
    if (!item?.shopifyProductId || !variant) return;
    bus.publish(AnalyticsEvent.PRODUCT_VIEWED, { url: url.href, products: [{
      id: item.shopifyProductId, title: item.name, vendor: item.shopifyVendor || item.brand || "Ahim Cohenn", quantity: 1,
      variantId: variant.id, variantTitle: [variant.color, variant.size].filter(Boolean).join(" / ") || "Default Title",
      price: { amount: String(variant.price), currencyCode: "ILS" }, sku: variant.sku,
    }] });
  }, [pathname, params, product]);
  return null;
}

// Quotes are independent Shopify carts. Match quantities by merchandise, because
// Shopify creates new line IDs for each quote, even when a line is unchanged.
export function useCartAnalytics(ready: boolean, cart: CartLine[], confirmed?: AnalyticsCart) {
  const previous = useRef<Map<string, number> | null>(null);
  const previousCart = useRef<AnalyticsCart | null>(null);
  useEffect(() => {
    if (!ready) return;
    if (!previous.current) {
      previous.current = new Map();
      for (const line of cart) if (line.variantId)
        previous.current.set(line.variantId, (previous.current.get(line.variantId) ?? 0) + line.qty);
    }
    if (!cart.length) {
      previous.current.clear();
      previousCart.current = null;
      return;
    }
    if (!confirmed || !window.Shopify?.analytics) return;
    const lines = new Map<string, AnalyticsCartLine>();
    for (const line of confirmed.lines.nodes ?? []) {
      const key = line.merchandise.id;
      const existing = lines.get(key);
      lines.set(key, existing ? { ...line, quantity: existing.quantity + line.quantity } : line);
    }
    for (const [key, line] of lines) {
      const oldQuantity = previous.current.get(key) ?? 0;
      if (line.quantity <= oldQuantity) continue;
      window.Shopify.analytics.publish(AnalyticsEvent.PRODUCT_ADD_TO_CART, {
        cart: confirmed, prevCart: previousCart.current, currentLine: line,
        ...(oldQuantity > 0 && { prevLine: { ...line, quantity: oldQuantity } }),
      });
    }
    previous.current = new Map(Array.from(lines, ([id, line]) => [id, line.quantity]));
    previousCart.current = confirmed;
  }, [ready, cart, confirmed]);
}

import "server-only";
import type { Product } from "@/lib/catalog";
import { loadShopCatalog } from "@/lib/shopify/load-catalog";
import type { CartLineDraft } from "@/lib/shopify/types";
import { visibleQuantityOffers, type AdminStore } from "./models";
import { readAdminStore } from "./storage";

export function applyAdminProducts(products: Product[], store: AdminStore): Product[] {
  const offers = new Map(visibleQuantityOffers(store).filter((offer) => offer.active && !offer.sourceVariantIds?.length).map((offer) => [offer.productId, offer]));
  const labels = new Map(store.labels.map((label) => [label.productId, label.text]));
  const hidden = new Set(store.hiddenQuantityOffers);
  if (!offers.size && !labels.size && !hidden.size) return products;
  return products.map((product) => {
    const offer = offers.get(product.id);
    const label = labels.get(product.id);
    if (hidden.has(product.id)) return { ...product, deal: undefined, quantityOfferHidden: true, promoLabel: label ?? product.promoLabel };
    if (!offer && !label) return product;
    return { ...product, ...(offer ? { deal: [offer.quantity, offer.total] as [number, number] } : {}), promoLabel: label };
  });
}

export async function managedDiscountCodes(drafts: CartLineDraft[]) {
  const store = await readAdminStore();
  const offers = [...store.bundles.flatMap((bundle) => {
    if (bundle.sourceVariantIds || bundle.bundleProductId || bundle.total === undefined || bundle.items.length !== 1) return [];
    const [[productId, quantity]] = bundle.items;
    return [{ productId, quantity, code: bundle.code ?? "", active: bundle.active }];
  }), ...visibleQuantityOffers(store).filter((offer) => !offer.sourceVariantIds?.length)].filter((offer) => offer.active);
  if (!offers.some((offer) => offer.code)) return [];
  const { products } = await loadShopCatalog();
  const productsById = new Map(products.map((product) => [product.id, product]));
  const quantities = new Map(drafts.map((draft) => [draft.merchandiseId, draft.quantity]));
  const best = new Map<string, { quantity: number; code: string }>();
  for (const offer of offers) {
    if ((best.get(offer.productId)?.quantity ?? 0) >= offer.quantity) continue;
    const product = productsById.get(offer.productId);
    const count = (product?.choices ?? []).reduce((sum, variant) => sum + (quantities.get(variant.id) ?? 0), 0);
    if (count >= offer.quantity) best.set(offer.productId, offer);
  }
  return [...new Set([...best.values()].map((offer) => offer.code).filter(Boolean))];
}

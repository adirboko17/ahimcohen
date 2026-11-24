import "server-only";
import { colorLabel } from "@/lib/catalog";
import { sizeLabel } from "@/lib/sizes";
import { quantityOffer } from "@/lib/quantity-offers";
import { loadShopCatalog } from "@/lib/shopify/load-catalog";
import type { CartLineDraft } from "@/lib/shopify/types";
import type { PackUnit } from "@/lib/types";
import { bundleCartProductId, quantityOfferMappingKey, quantityOfferTier, visibleQuantityOffers } from "./models";
import { bundleRevision, readBundleMappings } from "./bundle-mapping";
import { readAdminStore } from "./storage";

export async function quantityOfferCartResolver() {
  const [catalog, store, mappings] = await Promise.all([loadShopCatalog(), readAdminStore(), readBundleMappings()]);
  const offers = new Map(visibleQuantityOffers(store).filter((offer) => offer.active && offer.sourceVariantIds?.length)
    .map((offer) => [bundleCartProductId(offer.id), offer]));
  const products = new Map(catalog.products.map((product) => [product.id, product]));
  const bySource = new Map(mappings.map((mapping) => [mapping.source_product_id, mapping]));

  return (pid: string, merchandiseId: string, quantity: number, units: PackUnit[]): CartLineDraft | undefined => {
    const offer = offers.get(pid);
    if (!offer || !Array.isArray(units) || units.length < 1 || units.length > offer.quantity) return;
    const product = products.get(offer.productId);
    const mapping = bySource.get(quantityOfferMappingKey(offer.productId));
    if (!product || quantityOffer(product)?.kind === "pack" || mapping?.revision !== bundleRevision([quantityOfferTier(offer)])) return;
    const available = new Map(product.choices?.filter((choice) => choice.available).map((choice) => [choice.id, choice]));
    const packVariants = new Map(mapping.variants.filter((variant) => variant.tierId === offer.id && variant.price === offer.total)
      .map((variant) => [variant.sourceVariantId, variant.variantId]));
    const amounts = new Map<string, number>();
    for (const unit of units) {
      if (!unit || !Number.isInteger(unit.quantity) || unit.quantity < 1 || unit.quantity > offer.quantity ||
        !available.has(unit.variantId) || !packVariants.has(unit.variantId)) return;
      amounts.set(unit.variantId, (amounts.get(unit.variantId) ?? 0) + unit.quantity);
    }
    const composition = [...amounts].sort(([a], [b]) => a.localeCompare(b));
    if (composition.reduce((sum, [, count]) => sum + count, 0) !== offer.quantity ||
      packVariants.get(composition[0][0]) !== merchandiseId) return;
    return {
      merchandiseId, quantity, configurationKey: JSON.stringify(composition),
      attributes: composition.map(([id, count], index) => {
        const { color, size, sku } = available.get(id)!;
        return { key: `הרכב מארז ${index + 1}`, value: `${count} × ${[colorLabel(color), sizeLabel(size), sku && `מק״ט ${sku}`].filter(Boolean).join(" · ") || id}` };
      }),
    };
  };
}

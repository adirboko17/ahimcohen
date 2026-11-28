import "server-only";
import { colorLabel } from "@/lib/catalog";
import { sizeLabel } from "@/lib/sizes";
import { quantityOffer } from "@/lib/quantity-offers";
import { loadShopCatalog } from "@/lib/shopify/load-catalog";
import type { CartLineDraft } from "@/lib/shopify/types";
import type { PackUnit } from "@/lib/types";
import { activeManagedBundleTiers, bundleCartProductId, quantityOfferMappingKey, quantityOfferTier, visibleQuantityOffers, type AdminBundle } from "./models";
import { bundleRevision, readBundleMappings } from "./bundle-mapping";
import { readAdminStore } from "./storage";

export async function quantityOfferCartResolver() {
  const [catalog, store, mappings] = await Promise.all([loadShopCatalog(), readAdminStore(), readBundleMappings()]);
  const packs = new Map<string, { tier: AdminBundle; mappingKey: string; isQuantityOffer?: true }>();
  for (const offer of visibleQuantityOffers(store)) {
    if (offer.active && offer.sourceVariantIds?.length) {
      packs.set(bundleCartProductId(offer.id), { tier: quantityOfferTier(offer), mappingKey: quantityOfferMappingKey(offer.productId), isQuantityOffer: true });
    }
  }
  for (const tier of store.bundles) {
    if (tier.active && tier.mixedUnits && tier.sourceVariantIds?.length && tier.items.length === 1) {
      packs.set(bundleCartProductId(tier.id), { tier, mappingKey: tier.items[0][0] });
    }
  }
  const products = new Map(catalog.products.map((product) => [product.id, product]));
  const bySource = new Map(mappings.map((mapping) => [mapping.source_product_id, mapping]));

  return (pid: string, merchandiseId: string, quantity: number, units: PackUnit[]): CartLineDraft | undefined => {
    const pack = packs.get(pid);
    if (!pack) return;
    const { tier, mappingKey, isQuantityOffer } = pack;
    const [sourceId, unitCount] = tier.items[0];
    if (!Array.isArray(units) || units.length < 1 || units.length > unitCount) return;
    const product = products.get(sourceId);
    const mapping = bySource.get(mappingKey);
    if (!product || !mapping || (isQuantityOffer && quantityOffer(product)?.kind === "pack")) return;
    const activeTiers = isQuantityOffer ? [tier] : activeManagedBundleTiers(store.bundles, sourceId);
    if (mapping.revision !== bundleRevision(activeTiers)) return;
    const available = new Map(product.choices?.filter((choice) => choice.available).map((choice) => [choice.id, choice]));
    const packVariants = new Map(mapping.variants.filter((variant) => variant.tierId === tier.id && variant.price === tier.total)
      .map((variant) => [variant.sourceVariantId, variant.variantId]));
    const amounts = new Map<string, number>();
    for (const unit of units) {
      if (!unit || !Number.isInteger(unit.quantity) || unit.quantity < 1 || unit.quantity > unitCount ||
        !available.has(unit.variantId) || !packVariants.has(unit.variantId)) return;
      amounts.set(unit.variantId, (amounts.get(unit.variantId) ?? 0) + unit.quantity);
    }
    const composition = [...amounts].sort(([a], [b]) => a.localeCompare(b));
    if (composition.reduce((sum, [, count]) => sum + count, 0) !== unitCount ||
      packVariants.get(composition[0][0]) !== merchandiseId) return;
    return {
      merchandiseId, quantity, configurationKey: JSON.stringify(composition),
      attributes: composition.map(([id, count], index) => {
        const { color, size, sku, optionsLabel } = available.get(id)!;
        const description = optionsLabel || [colorLabel(color), sizeLabel(size)].filter(Boolean).join(" · ");
        return { key: `הרכב מארז ${index + 1}`, value: `${count} × ${[description, sku && `מק״ט ${sku}`].filter(Boolean).join(" · ") || id}` };
      }),
    };
  };
}

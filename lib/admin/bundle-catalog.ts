import "server-only";
import type { Product } from "@/lib/catalog";
import { bundleRevision, readBundleMappings } from "./bundle-mapping";
import { bundleCartProductId, quantityOfferMappingKey, quantityOfferTier, type AdminBundle, type AdminOffer } from "./models";

export async function managedBundleProducts(products: Product[], bundles: AdminBundle[], offers: AdminOffer[] = []) {
  const promotions = new Map<string, AdminBundle[]>();
  for (const bundle of bundles) {
    if (!bundle.active || !bundle.sourceVariantIds?.length || bundle.items.length !== 1) continue;
    const sourceId = bundle.items[0][0];
    const tiers = promotions.get(sourceId);
    if (tiers) tiers.push(bundle);
    else promotions.set(sourceId, [bundle]);
  }
  for (const offer of offers) {
    if (offer.active && offer.sourceVariantIds?.length) promotions.set(quantityOfferMappingKey(offer.productId), [quantityOfferTier(offer)]);
  }
  if (!promotions.size) return [];
  const mappings = await readBundleMappings().catch(() => []);
  const productsById = new Map(products.map((product) => [product.id, product]));
  return mappings.flatMap(({ source_product_id: mappingKey, variants, revision }): Product[] => {
    const tiers = promotions.get(mappingKey);
    if (!tiers || revision !== bundleRevision(tiers)) return [];
    const source = productsById.get(tiers[0].items[0][0]);
    if (!source) return [];
    const sourceChoices = new Map(source.choices?.map((variant) => [variant.id, variant]));
    const quantityOffer = mappingKey === quantityOfferMappingKey(source.id);
    return tiers.flatMap((tier): Product[] => {
      const choices = variants.filter((variant) => variant.tierId === tier.id).flatMap((mapping) => {
        const original = sourceChoices.get(mapping.sourceVariantId);
        return original ? [{ ...original, id: mapping.variantId, sourceVariantId: original.id, price: mapping.price, available: true }] : [];
      });
      if (!choices.length || tier.total === undefined) return [];
      return [{
        ...source, id: bundleCartProductId(tier.id), name: `${source.name} — ${quantityOffer ? `${tier.items[0][1]} יחידות` : tier.name}`, bundleSourceId: source.id,
        price: tier.total, choices, deal: undefined, was: undefined, promoLabel: undefined, sku: undefined,
      }];
    });
  });
}

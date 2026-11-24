export type AdminImage = { src: string; width: number; height: number };
export type AdminSaveResult = { message: string; ok: boolean; warning?: true };
export type HeroDevice = "desktop" | "mobile";
export type HeroTarget =
  | { kind: "link"; href: string }
  | { kind: "category" | "product"; id: string; label: string };
export type AdminHeroImage = AdminImage & { target?: HeroTarget | null };
export type AdminHero = {
  id: string;
  alt?: string;
  href?: string;
  desktop?: AdminHeroImage;
  mobile?: AdminHeroImage;
  published?: boolean;
};

export function heroImageTarget(hero: AdminHero | undefined, device: HeroDevice): HeroTarget | null {
  const image = hero?.[device];
  if (!image) return null;
  if (image.target !== undefined) return image.target;
  return hero?.href ? { kind: "link", href: hero.href } : null;
}

export function heroTargetHref(target: HeroTarget) {
  if (target.kind === "link") return target.href;
  return `/${target.kind === "product" ? "p" : "c"}/${encodeURIComponent(target.id)}`;
}

export function heroIsPublished(hero: AdminHero, activeHero: string) {
  return hero.published ?? (hero.id === activeHero);
}

export type AdminBundle = { id: string; name: string; items: [string, number][]; active: boolean; total?: number; bundleProductId?: string; code?: string; sourceVariantIds?: string[]; bestValue?: boolean; showInQuantityOffers?: boolean };
export type PublishedBundle = { id: string; name: string; quantity: number; total: number; productId?: string; cartProductId?: string; bestValue?: boolean; quantityOffer?: true; mixedUnits?: boolean };

export function bundleTierName(quantity: number) {
  if (quantity === 2) return "זוג";
  if (quantity === 3) return "שלישייה";
  return `${quantity} יחידות`;
}

export function bundleCartProductId(id: string) {
  return `bundle-cart-${id}`;
}

export function bundleGroupSnapshot(tiers: AdminBundle[]) {
  return JSON.stringify([...tiers].sort((a, b) => a.id.localeCompare(b.id)).map((tier) => [
    tier.id, tier.name, tier.items, tier.total, tier.active, tier.bundleProductId, tier.bestValue, tier.showInQuantityOffers,
  ]));
}
export type AdminOffer = { id: string; productId: string; quantity: number; total: number; code: string; active: boolean; sourceVariantIds?: string[] };
export type PublishedQuantityOffer = Pick<AdminOffer, "id" | "productId" | "quantity" | "total">;
export type FeaturedQuantityBundle = Omit<PublishedQuantityOffer, "total"> & { total?: number; linkedProductId?: string; managed?: boolean };

export function featuredQuantityBundles(bundles: AdminBundle[]): FeaturedQuantityBundle[] {
  return bundles.flatMap((bundle) => bundle.active && bundle.showInQuantityOffers && bundle.items.length === 1 ? [{
    id: bundle.id, productId: bundle.items[0][0], quantity: bundle.items[0][1], total: bundle.total,
    linkedProductId: bundle.bundleProductId, managed: !!bundle.sourceVariantIds?.length,
  }] : []);
}

export function publishedQuantityOffers(offers: AdminOffer[]): PublishedQuantityOffer[] {
  return offers.filter((offer) => offer.active && offer.sourceVariantIds?.length)
    .map(({ id, productId, quantity, total }) => ({ id, productId, quantity, total }));
}

export function quantityOfferMappingKey(productId: string) {
  return `quantity-offer:${productId}`;
}

export function quantityOfferTier(offer: AdminOffer): AdminBundle {
  return { id: offer.id, name: `מבצע כמות · ${offer.quantity} יחידות`, items: [[offer.productId, offer.quantity]],
    total: offer.total, active: offer.active, sourceVariantIds: offer.sourceVariantIds };
}
export type AdminLabel = { id: string; productId: string; text: string };
export type AdminReview = { id: string; productId: string; author: string; rating: number; text: string; published: boolean; source?: "customer" | "admin"; createdAt?: string };
export function reviewAwaitsApproval(review: AdminReview) {
  return review.source === "customer" && !review.published;
}
export type PublishedReview = Pick<AdminReview, "id" | "author" | "rating" | "text" | "createdAt">;
export type AdminRedirect = { id: string; slug: string; destination: string };
export type AdminSale = { id: string; title: string; productId: string; variantId: string; quantity: number; code: string; url: string };

export type AdminStore = {
  sets: import("../product-sets").ProductSet[];
  bundles: AdminBundle[];
  offers: AdminOffer[];
  hiddenQuantityOffers: string[];
  labels: AdminLabel[];
  reviews: AdminReview[];
  links: AdminRedirect[];
  sales: AdminSale[];
  heroes: AdminHero[];
  activeHero: string;
};

export function visibleQuantityOffers(store: AdminStore) {
  const hidden = new Set(store.hiddenQuantityOffers);
  return store.offers.filter((offer) => !hidden.has(offer.productId));
}

export const DEFAULT_HERO = {
  id: "default",
  alt: "האחים כהן — 3 סווטשירטים ב־120 ₪. לקנייה",
  href: "/p/סווטשירט-5-25",
  desktop: { src: "/images/hero/sweatshirt-promotion.jpg", width: 1983, height: 793 },
  mobile: { src: "/images/hero/sweatshirt-promotion-mobile.jpg", width: 1149, height: 1369 },
} satisfies AdminHero;

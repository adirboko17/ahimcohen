import type { Product } from "./catalog";
import { fmt } from "./pricing";
import { quantityOffer } from "./quantity-offers";

export function heroDeals(products: Product[]) {
  return products.flatMap(product => {
    if (product.quantityOfferHidden) return [];
    if (product.choices?.length && !product.choices.some(choice => choice.available)) return [];
    const offer = quantityOffer(product);
    if (!offer && !(product.was && product.was > product.price)) return [];
    const price = offer?.total ?? product.price;
    const regular = offer?.regularTotal ?? (offer ? null : product.was);
    if (!Number.isFinite(price) || price <= 0) return [];
    const description = offer
      ? `${offer.quantity} ${offer.quantityLabel}${offer.kind === "pack" ? " במארז" : " במבצע"} · ${fmt(price)}${regular ? ` במקום ${fmt(regular)}` : ""}`
      : `${fmt(price)}${regular ? ` במקום ${fmt(regular)}` : ""}`;
    return [{
      id: product.id,
      title: offer?.title ?? product.name,
      image: product.imgs?.[0],
      price,
      description,
      href: `/p/${encodeURIComponent(product.id)}${offer ? "?quantity-offer=1" : ""}`,
    }];
  }).slice(0, 7);
}

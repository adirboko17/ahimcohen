import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ProductView } from "@/components/ProductView";
import { bundleCartProductId, visibleQuantityOffers, type PublishedBundle } from "@/lib/admin/models";
import { managedBundleProducts } from "@/lib/admin/bundle-catalog";
import { readAdminStore } from "@/lib/admin/storage";
import { publishedReviews } from "@/lib/admin/reviews";
import { loadShopCatalog } from "@/lib/shopify/load-catalog";
import { quantityOffer } from "@/lib/quantity-offers";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ color?: string | string[]; size?: string | string[]; "quantity-offer"?: string | string[]; bundle?: string | string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const handle = decodeURIComponent(id);
  const catalog = await loadShopCatalog();
  const product = catalog.products.find((item) => item.id === handle);
  return { title: product ? product.name : "מוצר", description: product?.desc?.[0] };
}

export default async function Page({ params, searchParams }: Props) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const handle = decodeURIComponent(id);
  const [catalog, admin] = await Promise.all([loadShopCatalog(), readAdminStore()]);
  const source = catalog.products.find((item) => item.id === handle);
  if (!source) notFound();
  const visibleOffers = visibleQuantityOffers(admin);
  const [reviews, bundleProducts] = await Promise.all([
    publishedReviews(admin.reviews, handle), managedBundleProducts(catalog.products, admin.bundles, visibleOffers),
  ]);
  const availableBundleProducts = new Set(bundleProducts.map(({ id }) => id));
  const requestedBundle = typeof query.bundle === "string" ? query.bundle : undefined;
  const selectedOffer = visibleOffers.find((offer) => offer.id === requestedBundle && offer.active && offer.productId === handle &&
    offer.sourceVariantIds?.length && availableBundleProducts.has(bundleCartProductId(offer.id)));
  const bundles = admin.bundles.flatMap(({ id, name, items, active, total, sourceVariantIds, bundleProductId, bestValue }): PublishedBundle[] => {
    if (!active || items.length !== 1 || items[0][0] !== handle) return [];
    const tier = { id, name, quantity: items[0][1], ...(bestValue && { bestValue: true }) };
    if (sourceVariantIds) {
      const cartProductId = bundleCartProductId(id);
      return total !== undefined && availableBundleProducts.has(cartProductId) ? [{ ...tier, total, cartProductId }] : [];
    }
    if (bundleProductId) {
      const pack = bundleProductId !== handle && catalog.products.find((item) => item.id === bundleProductId);
      return pack ? [{ ...tier, total: pack.price, productId: pack.id }] : [];
    }
    return total === undefined ? [] : [{ ...tier, total }];
  });
  const initialBundle = requestedBundle;
  const linkedProduct = initialBundle && bundles.find((bundle) => bundle.id === initialBundle)?.productId;
  if (linkedProduct) redirect(`/p/${encodeURIComponent(linkedProduct)}`);
  const offerSelection: PublishedBundle[] | undefined = selectedOffer && [{
    id: selectedOffer.id, name: `${selectedOffer.quantity} יחידות`, quantity: selectedOffer.quantity,
    total: selectedOffer.total, cartProductId: bundleCartProductId(selectedOffer.id), quantityOffer: true,
    mixedUnits: quantityOffer(source)?.kind !== "pack" && new Set(source.choices?.filter(({ available }) => available)
      .map(({ color, size }) => JSON.stringify([color, size]))).size > 1,
  }];
  return <ProductView id={handle} setSetting={admin.sets.find(setting => setting.id === handle)} reviews={reviews} bundles={offerSelection ?? bundles} initialBundle={initialBundle}
    fromQuantityOffer={query["quantity-offer"] === "1"} initialColor={typeof query.color === "string" ? query.color : undefined} initialSize={typeof query.size === "string" ? query.size : undefined} />;
}

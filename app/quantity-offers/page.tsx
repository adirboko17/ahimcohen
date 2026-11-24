import type { Metadata } from "next";
import { QuantityOffersView } from "@/components/QuantityOffersView";
import { featuredQuantityBundles, publishedQuantityOffers, visibleQuantityOffers } from "@/lib/admin/models";
import { readAdminStore } from "@/lib/admin/storage";

export const metadata: Metadata = {
  title: "מבצעי כמות",
  description: "כל מבצעי הכמות של האחים כהן - ביגוד עבודה, מארזים וציוד לעסקים ולצוותים.",
};

export default async function Page() {
  const admin = await readAdminStore();
  return <QuantityOffersView managedOffers={publishedQuantityOffers(visibleQuantityOffers(admin))} featuredBundles={featuredQuantityBundles(admin.bundles)} />;
}

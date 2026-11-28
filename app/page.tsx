import { randomInt } from "node:crypto";
import { Home } from "@/components/Home";
import { readAdminStore } from "@/lib/admin/storage";
import { bundleCartProductId, heroIsPublished } from "@/lib/admin/models";

export default async function Page() {
  const settings = await readAdminStore();
  const bundles = settings.bundles.filter((bundle) => bundle.active && bundle.items.length > 1).map(({ id, name, items, total, bundleProductId, sourceVariantIds }) => ({
    id, name, items, total, bundleProductId, cartProductId: sourceVariantIds ? bundleCartProductId(id) : undefined,
  }));
  const promotions = settings.heroes.filter((hero) => heroIsPublished(hero, settings.activeHero));
  return <Home promotions={promotions} bundles={bundles} showNewArrivals budgetSeed={randomInt(2 ** 32)} />;
}

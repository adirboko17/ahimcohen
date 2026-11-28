import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { Assistant, Karantina } from "next/font/google";
import { Shell } from "@/components/Shell";
import { StorefrontScripts, StorefrontViews } from "@/components/StorefrontAnalytics";
import { shopDomain } from "@/lib/shopify/config";
import { PageLoading } from "@/components/PageLoading";
import { CatalogProvider } from "@/lib/catalog-context";
import { packCatalog } from "@/lib/catalog-wire";
import { loadStorefrontCatalog } from "@/lib/shopify/storefront-catalog";
import { StoreProvider } from "@/lib/store";
import { applyAdminProducts } from "@/lib/admin/commerce";
import { managedBundleProducts } from "@/lib/admin/bundle-catalog";
import { setCartProducts } from "@/lib/product-sets";
import { readAdminStore } from "@/lib/admin/storage";
import { visibleQuantityOffers } from "@/lib/admin/models";
import { customerAuthConfig } from "@/lib/customer-auth-config";
import "./globals.css";

const assistant = Assistant({
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-assistant",
  display: "swap",
});

const karantina = Karantina({
  subsets: ["hebrew", "latin"],
  weight: ["400", "700"],
  variable: "--font-display",
  display: "swap",
});

export const maxDuration = 60;

export const metadata: Metadata = {
  title: {
    default: "האחים כהן | בגדי עבודה ונעלי בטיחות",
    template: "%s | האחים כהן",
  },
  description: "ביגוד ומיגון לעבודה בבאר שבע. לקנייה של פריט אחד או להזמנה ממותגת לכל הצוות - מאותו קטלוג, באותם מחירים.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Render on request without disabling the catalog's persistent Data Cache.
  await connection();
  return (
    <html lang="he" dir="rtl" className={`${assistant.variable} ${karantina.variable}`}>
      <head>
        <StorefrontScripts domain={shopDomain()} shopId={process.env.SHOPIFY_ANALYTICS_SHOP_ID || "86340174130"} />
      </head>
      <body>
        <Suspense fallback={<PageLoading />}>
          <ShopLayout>{children}</ShopLayout>
        </Suspense>
      </body>
    </html>
  );
}

async function ShopLayout({ children }: { children: React.ReactNode }) {
  const [catalog, admin] = await Promise.all([loadStorefrontCatalog(), readAdminStore()]);
  const bundleProducts = await managedBundleProducts(catalog.products, admin.bundles, visibleQuantityOffers(admin));
  return (
    <CatalogProvider colorMappings={admin.colorMappings}
      catalog={packCatalog({ categories: catalog.categories, products: [...applyAdminProducts(catalog.products, admin), ...bundleProducts, ...setCartProducts(catalog.products, admin.sets)] })}>
      <StoreProvider customerAuth={customerAuthConfig()}>
        <StorefrontViews />
        <Shell>{children}</Shell>
      </StoreProvider>
    </CatalogProvider>
  );
}

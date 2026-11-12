import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { Assistant, Karantina } from "next/font/google";
import { Shell } from "@/components/Shell";
import { PageLoading } from "@/components/PageLoading";
import { CatalogProvider } from "@/lib/catalog-context";
import { packCatalog } from "@/lib/catalog-wire";
import { loadShopCatalog } from "@/lib/shopify/load-catalog";
import { StoreProvider } from "@/lib/store";
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

export const metadata: Metadata = {
  title: {
    default: "האחים כהן | בגדי עבודה ונעלי בטיחות",
    template: "%s | האחים כהן",
  },
  description: "ביגוד ומיגון לעבודה בבאר שבע. לקנייה של פריט אחד או להזמנה ממותגת לכל הצוות — מאותו קטלוג, באותם מחירים.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Render on request without disabling the catalog's persistent Data Cache.
  await connection();
  return (
    <html lang="he" dir="rtl" className={`${assistant.variable} ${karantina.variable}`}>
      <body>
        <Suspense fallback={<PageLoading />}>
          <ShopLayout>{children}</ShopLayout>
        </Suspense>
      </body>
    </html>
  );
}

async function ShopLayout({ children }: { children: React.ReactNode }) {
  const catalog = await loadShopCatalog();
  return (
    <CatalogProvider catalog={packCatalog(catalog)}>
      <StoreProvider>
        <Shell>{children}</Shell>
      </StoreProvider>
    </CatalogProvider>
  );
}

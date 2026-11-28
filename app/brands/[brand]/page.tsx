import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrandView } from "@/components/BrandView";
import { brandById, catalogBrands } from "@/lib/brands";
import { loadShopCatalog } from "@/lib/shopify/load-catalog";
import { cache } from "react";

const resolveBrand = cache(async (id: string) => {
  if (!id.startsWith("brand-")) return brandById(id);
  const { products } = await loadShopCatalog();
  return catalogBrands(products).find(brand => brand.id === id);
});

type Props = { params: Promise<{ brand: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const brand = await resolveBrand((await params).brand);
  return { title: brand?.name ?? "מותג", description: brand ? `מוצרי ${brand.name} באחים כהן. ביגוד, הנעלה וציוד לעבודה.` : undefined };
}

export default async function Page({ params }: Props) {
  const brand = await resolveBrand((await params).brand);
  if (!brand) notFound();
  return <BrandView key={brand.id} brand={brand} />;
}

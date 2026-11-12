import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductView } from "@/components/ProductView";
import { loadShopCatalog } from "@/lib/shopify/load-catalog";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const handle = decodeURIComponent(id);
  const catalog = await loadShopCatalog();
  const product = catalog.products.find((item) => item.id === handle);
  return { title: product ? product.name : "מוצר", description: product?.desc?.[0] };
}

export default async function Page({ params }: Props) {
  const { id } = await params;
  const handle = decodeURIComponent(id);
  const catalog = await loadShopCatalog();
  if (!catalog.products.some((item) => item.id === handle)) notFound();
  return <ProductView id={handle} />;
}

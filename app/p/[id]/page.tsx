import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductView } from "@/components/ProductView";
import { loadShopCatalog } from "@/lib/shopify/load-catalog";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ color?: string | string[]; size?: string | string[]; "quantity-offer"?: string | string[] }> };

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
  const catalog = await loadShopCatalog();
  if (!catalog.products.some((item) => item.id === handle)) notFound();
  return <ProductView id={handle} fromQuantityOffer={query["quantity-offer"] === "1"} initialColor={typeof query.color === "string" ? query.color : undefined} initialSize={typeof query.size === "string" ? query.size : undefined} />;
}

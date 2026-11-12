import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CategoryView } from "@/components/CategoryView";
import { loadShopCatalog } from "@/lib/shopify/load-catalog";

type Props = { params: Promise<{ cat: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { cat } = await params;
  const id = decodeURIComponent(cat);
  const catalog = await loadShopCatalog();
  const category = catalog.categories.find((item) => item.id === id);
  return { title: category ? category.name : "קטגוריה" };
}

export default async function Page({ params }: Props) {
  const { cat } = await params;
  const id = decodeURIComponent(cat);
  const catalog = await loadShopCatalog();
  if (!catalog.categories.some((item) => item.id === id)) notFound();
  return <CategoryView catId={id} />;
}

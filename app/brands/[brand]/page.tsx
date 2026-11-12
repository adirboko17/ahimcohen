import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrandView } from "@/components/BrandView";
import { brandById } from "@/lib/brands";

type Props = { params: Promise<{ brand: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const brand = brandById((await params).brand);
  return { title: brand?.name ?? "מותג", description: brand ? `מוצרי ${brand.name} באחים כהן. ביגוד, הנעלה וציוד לעבודה.` : undefined };
}

export default async function Page({ params }: Props) {
  const brand = brandById((await params).brand);
  if (!brand) notFound();
  return <BrandView key={brand.id} brand={brand} />;
}

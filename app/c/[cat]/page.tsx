import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { legacyOutdoorFootwearCategoryId, outdoorFootwear, workCoatsAndRobes } from "@/lib/category-placement";
import { CategoryView } from "@/components/CategoryView";
import { loadShopCatalog } from "@/lib/shopify/load-catalog";

type Props = { params: Promise<{ cat: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { cat } = await params;
  const id = decodeURIComponent(cat);
  if (id === "redback") return { title: "Redback" };
  if (id === legacyOutdoorFootwearCategoryId) return { title: outdoorFootwear.sub };
  const catalog = await loadShopCatalog();
  const category = catalog.categories.find((item) => item.id === id);
  return { title: category ? category.name : "קטגוריה" };
}

export default async function Page({ params, searchParams }: Props) {
  const { cat } = await params;
  const id = decodeURIComponent(cat);
  if (id === "redback") permanentRedirect("/brands/redback");
  if (id === legacyOutdoorFootwearCategoryId) {
    const filters = new URLSearchParams({ sub: outdoorFootwear.sub });
    permanentRedirect("/c/" + outdoorFootwear.id + "?" + filters);
  }
  if (id === workCoatsAndRobes.parentId) {
    const query = await searchParams;
    const sub = Array.isArray(query.sub) ? query.sub[0] : query.sub;
    if (workCoatsAndRobes.previous.some(label => label === sub)) {
      const filters = new URLSearchParams({ sub: workCoatsAndRobes.sub });
      for (const [key, value] of Object.entries(query)) {
        if (key === "sub" || value === undefined) continue;
        for (const entry of Array.isArray(value) ? value : [value]) filters.append(key, entry);
      }
      permanentRedirect("/c/" + id + "?" + filters);
    }
  }
  const catalog = await loadShopCatalog();
  if (!catalog.categories.some((item) => item.id === id)) notFound();
  return <CategoryView catId={id} />;
}

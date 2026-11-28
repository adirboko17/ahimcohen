import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { hasStorefrontSubcategoryChanges, legacyOutdoorFootwearCategoryId, outdoorFootwear, storefrontSubcategory, storefrontSubcategoryParent } from "@/lib/category-placement";
import { CategoryView } from "@/components/CategoryView";
import { loadStorefrontCatalog, storefrontCategoryDefinition } from "@/lib/shopify/storefront-catalog";

type Props = { params: Promise<{ cat: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { cat } = await params;
  const id = decodeURIComponent(cat);
  if (id === "redback") return { title: "Redback" };
  if (id === legacyOutdoorFootwearCategoryId) return { title: outdoorFootwear.sub };
  const catalog = await loadStorefrontCatalog();
  const category = catalog.categories.find((item) => item.id === id) ?? await storefrontCategoryDefinition(id);
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
  if (hasStorefrontSubcategoryChanges(id)) {
    const query = await searchParams;
    const sub = Array.isArray(query.sub) ? query.sub[0] : query.sub;
    const current = sub && storefrontSubcategory(id, sub);
    const parentId = sub ? storefrontSubcategoryParent(id, sub) : id;
    if (current && (current !== sub || parentId !== id)) {
      const filters = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (key === "sub" || value === undefined) continue;
        for (const entry of Array.isArray(value) ? value : [value]) filters.append(key, entry);
      }
      filters.set("sub", current);
      permanentRedirect(`/c/${parentId}?${filters}`);
    }
  }
  const catalog = await loadStorefrontCatalog();
  const visible = catalog.categories.some((item) => item.id === id);
  const fallback = visible ? undefined : await storefrontCategoryDefinition(id);
  if (!visible && !fallback) notFound();
  return <CategoryView catId={id} categoryFallback={fallback} />;
}

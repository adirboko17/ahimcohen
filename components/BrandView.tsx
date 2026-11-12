"use client";

import type { Brand } from "@/lib/brands";
import { CategoryView } from "./CategoryView";

// Share filters, variant photos, infinite loading and history with categories.
export function BrandView({ brand }: { brand: Brand }) {
  return <CategoryView brand={brand} />;
}

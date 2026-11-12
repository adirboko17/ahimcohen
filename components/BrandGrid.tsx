"use client";

import Link from "next/link";
import { BRANDS } from "@/lib/brands";
import { useCatalog } from "@/lib/catalog-context";

export function BrandGrid({ featured = false }: { featured?: boolean }) {
  const { products } = useCatalog();
  const counts = new Map<string, number>();
  for (const product of products) {
    if (product.brand) counts.set(product.brand, (counts.get(product.brand) ?? 0) + 1);
  }
  const brands = BRANDS.filter(brand => (!featured || brand.featured) && counts.has(brand.name));
  return <div className="brands-grid">
    {brands.map(brand => <Link key={brand.id} href={`/brands/${brand.id}`} className="brand-card" aria-label={`למוצרי ${brand.name}`}>
      <span className={`brand-logo brand-logo-${brand.id}`}>
        {brand.logo ? <img src={brand.logo} alt={brand.name} width={180} height={72} loading="lazy" decoding="async" /> : <span dir="ltr">{brand.name}</span>}
      </span>
      <span className="brand-card-foot"><span>{counts.get(brand.name)} מוצרים</span><span aria-hidden="true">←</span></span>
    </Link>)}
  </div>;
}

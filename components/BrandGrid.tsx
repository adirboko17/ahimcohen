"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef, useState } from "react";
import { useCatalog } from "@/lib/catalog-context";
import { startBrandAutoplay } from "@/lib/brand-carousel-autoplay";

export function BrandGrid({ featured = false }: { featured?: boolean }) {
  const { products, brands: directory, brand: findBrand } = useCatalog();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("featured");
  const counts = new Map<string, number>();
  for (const product of products) {
    const brand = findBrand(product.brand);
    if (brand) counts.set(brand.name, (counts.get(brand.name) ?? 0) + 1);
  }
  const allBrands = directory.filter(brand => counts.has(brand.name));
  const search = query.trim().toLocaleLowerCase().replace(/[\s-]+/g, "");
  const brands = featured ? allBrands.filter(brand => brand.featured || brand.id === "neri") : allBrands.filter(brand =>
    `${brand.name}${brand.id}`.toLocaleLowerCase().replace(/[\s-]+/g, "").includes(search)
  ).sort((a, b) => sort === "name" ? a.name.localeCompare(b.name, "he") : sort === "products" ? (counts.get(b.name) ?? 0) - (counts.get(a.name) ?? 0) : 0);
  const track = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!featured || !brands.length || !track.current) return;
    return startBrandAutoplay(track.current).stop;
  }, [featured, brands.length]);
  return <div className={featured ? "brands-showcase" : "brand-directory"}>
    {!featured && <>
      <header className="directory-heading">
        <h1 className="k">המותגים שלנו</h1>
        <p>ביגוד, הנעלה וציוד לעבודה</p>
      </header>
      <div className="directory-toolbar">
        <div className="directory-search">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
          <input type="search" aria-label="חיפוש מותג" placeholder="איזה מותג מחפשים?" value={query} onChange={event => setQuery(event.target.value)} />
          {query && <button type="button" aria-label="ניקוי חיפוש המותגים" onClick={() => setQuery("")}>×</button>}
        </div>
        <label className="directory-sort">מיון לפי<select value={sort} onChange={event => setSort(event.target.value)}><option value="featured">מומלצים</option><option value="name">שם המותג</option><option value="products">כמות מוצרים</option></select></label>
      </div>
      <div className="directory-results"><h2>כל המותגים, לבחירתכם</h2><span role="status">{brands.length === allBrands.length ? `${allBrands.length} מותגים` : `${brands.length} מתוך ${allBrands.length} מותגים`}</span></div>
    </>}
    <div className="brands-grid" ref={track}>
    {(featured ? [false, true] : [false]).map(duplicate => <Fragment key={String(duplicate)}>
    {brands.map((brand) => <Link key={brand.id} href={`/brands/${brand.id}`} className={`brand-card${featured && !brand.featured ? " brand-card-desktop-only" : ""}${duplicate ? " brand-card-loop-copy" : ""}`} aria-label={`למוצרי ${brand.name}`} aria-hidden={duplicate || undefined} tabIndex={duplicate ? -1 : undefined}>
      <span className={`brand-logo brand-logo-${brand.id}`}>
        {brand.logo ? <img src={brand.logo} alt={brand.name} width={180} height={72} loading="lazy" decoding="async" /> : <span dir="ltr">{brand.name}</span>}
      </span>
      {!featured && <span className="directory-card-name" dir="auto">{brand.name}</span>}
      <span className="brand-card-foot"><span>{counts.get(brand.name)} מוצרים</span><span aria-hidden="true">←</span></span>
    </Link>)}
    {featured && <Link href="/brands" className={`brand-card brand-card-all${duplicate ? " brand-card-loop-copy" : ""}`} aria-label="לכל המותגים באתר" aria-hidden={duplicate || undefined} tabIndex={duplicate ? -1 : undefined}>
      <span className="brand-logo"><span className="k brand-all-title">לכל המותגים</span></span>
      <span className="brand-card-foot"><span>{allBrands.length} מותגים במקום אחד</span><span aria-hidden="true">←</span></span>
    </Link>}
    </Fragment>)}
    </div>
    {!featured && brands.length === 0 && <div className="directory-empty"><h3>לא מצאנו מותג בשם הזה</h3><p>נסו לחפש בשם אחר, או חזרו לכל המותגים.</p><button type="button" className="btn" onClick={() => setQuery("")}>לכל המותגים</button></div>}
  </div>;
}

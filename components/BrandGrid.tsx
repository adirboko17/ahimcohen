"use client";

import Link from "next/link";
import { Fragment, useEffect, useId, useRef, useState } from "react";
import { BRANDS } from "@/lib/brands";
import { useCatalog } from "@/lib/catalog-context";
import { brandLoopLength, startBrandAutoplay } from "@/lib/brand-carousel-autoplay";

export function BrandGrid({ featured = false }: { featured?: boolean }) {
  const { products } = useCatalog();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("featured");
  const counts = new Map<string, number>();
  for (const product of products) {
    if (product.brand) counts.set(product.brand, (counts.get(product.brand) ?? 0) + 1);
  }
  const allBrands = BRANDS.filter(brand => counts.has(brand.name));
  const search = query.trim().toLocaleLowerCase().replace(/[\s-]+/g, "");
  const brands = featured ? allBrands.filter(brand => brand.featured) : allBrands.filter(brand =>
    `${brand.name}${brand.id}`.toLocaleLowerCase().replace(/[\s-]+/g, "").includes(search)
  ).sort((a, b) => sort === "name" ? a.name.localeCompare(b.name, "he") : sort === "products" ? (counts.get(b.name) ?? 0) - (counts.get(a.name) ?? 0) : 0);
  const cardCount = brands.length + (featured ? 1 : 0);
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const interruptAutoplay = useRef<(() => void) | null>(null);
  const trackId = useId();
  const selected = Math.min(active, Math.max(0, cardCount - 1));
  useEffect(() => {
    if (!featured || cardCount < 2 || !track.current) return;
    const { stop, interact } = startBrandAutoplay(track.current);
    interruptAutoplay.current = interact;
    return () => { stop(); interruptAutoplay.current = null; };
  }, [featured, cardCount]);
  useEffect(() => {
    const element = track.current;
    if (!featured || !element) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const maxScroll = element.scrollWidth - element.clientWidth;
        if (maxScroll <= 1) { setActive(0); return; }
        const edge = element.getBoundingClientRect().right - parseFloat(getComputedStyle(element).paddingRight);
        const cards = Array.from(element.querySelectorAll<HTMLElement>(".brand-card"));
        let closest = 0, distance = Infinity;
        cards.forEach((card, index) => {
          const delta = Math.abs(card.getBoundingClientRect().right - edge);
          if (delta < distance) { closest = index; distance = delta; }
        });
        setActive(closest % cardCount);
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    element.addEventListener("scroll", measure, { passive: true });
    measure();
    return () => { observer.disconnect(); element.removeEventListener("scroll", measure); cancelAnimationFrame(frame); };
  }, [featured, cardCount]);
  const move = (step: number) => {
    interruptAutoplay.current?.();
    const element = track.current;
    if (!element) return;
    const cycle = brandLoopLength(element);
    if (cycle <= 0) return;
    let target = selected + step;
    let position = Math.abs(element.scrollLeft) % cycle;
    if (target < 0) { position += cycle; target += cardCount; }
    element.scrollTo({ left: -position, behavior: "instant" });
    const card = element.querySelectorAll<HTMLElement>(".brand-card")[target];
    if (!card) return;
    const edge = element.getBoundingClientRect().right - parseFloat(getComputedStyle(element).paddingRight);
    element.scrollBy({ left: card.getBoundingClientRect().right - edge, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  };
  return <div className={featured ? "brands-showcase" : "brand-directory"}>
    {!featured && <>
      <header className="directory-hero">
        <div className="directory-hero-copy">
          <span className="directory-eyebrow"><i aria-hidden="true" /> איכות שמגיעה לעבודה</span>
          <h1 className="k">המותגים <span>שלנו.</span></h1>
          <p>ביגוד, הנעלה וציוד לעבודה.<br />בוחרים מותג ומגלים את כל המוצרים שלו.</p>
        </div>
        <div className="directory-hero-count"><strong className="k">{allBrands.length}</strong><span>מותגים.<br />מקום אחד.</span></div>
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
    <div className="brands-grid" ref={track} id={trackId}>
    {(featured ? [false, true] : [false]).map(duplicate => <Fragment key={String(duplicate)}>
    {brands.map((brand) => <Link key={brand.id} href={`/brands/${brand.id}`} className={`brand-card${featured && brand.id === "albatros" ? " brand-card-mobile-only" : ""}${duplicate ? " brand-card-loop-copy" : ""}`} aria-label={`למוצרי ${brand.name}`} aria-hidden={duplicate || undefined} tabIndex={duplicate ? -1 : undefined}>
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
    {featured && cardCount > 1 && <div className="brands-carousel-nav">
      <div className="brands-carousel-position"><span dir="ltr">{String(selected + 1).padStart(2, "0")} <span>/ {String(cardCount).padStart(2, "0")}</span></span></div>
      <div className="brands-carousel-progress" aria-hidden="true"><span style={{ width: `${((selected + 1) / cardCount) * 100}%` }} /></div>
      <div className="brands-carousel-buttons">
        <button type="button" aria-label="המותג הקודם" aria-controls={trackId} onClick={() => move(-1)}>→</button>
        <button type="button" aria-label="המותג הבא" aria-controls={trackId} onClick={() => move(1)}>←</button>
      </div>
    </div>}
  </div>;
}

"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { BRANDS, FREE_SHIPPING, IM, KITS, PROFESSIONS, phOf, type Category, type Product } from "@/lib/catalog";
import { useCatalog } from "@/lib/catalog-context";
import { fmt, priceFor } from "@/lib/pricing";
import { useScrollLock, useStore } from "@/lib/store";
import { IconBag, IconCheck, IconLock, IconPhone, IconPin, IconTruck } from "./icons";
import { ProductTile } from "./ProductTile";

const CATEGORY_ART: Record<string, string> = {
  shoes: "/images/categories/shoes-v1.webp",
  winter: "/images/categories/winter-v1.webp",
  pro: "/images/categories/pro-v1.webp",
  safety: "/images/categories/safety-v1.webp",
  rep: "/images/categories/rep-v1.webp",
  kitchen: "/images/categories/kitchen-v1.webp",
  disp: "/images/categories/disp-v1.webp",
  acc: "/images/categories/acc-v1.webp",
  redback: "/images/categories/redback-v1.webp",
};

function CategoryTile({ category, products }: { category: Category; products: Product[] }) {
  const pictured = products.filter((item) =>
    (item.cats ?? [item.cat]).includes(category.id) && item.imgs?.[0]
  );
  // Prefer the main subcategory's product photography over promotional collection banners.
  const representative = pictured.find((item) =>
    (item.subs ?? [item.sub]).includes(category.subs[0])
  ) ?? pictured[0];
  const artwork = CATEGORY_ART[category.id];
  const image = artwork ?? representative?.imgs?.[0];
  const [failedImage, setFailedImage] = useState<string | null>(null);

  return (
    <Link href={`/c/${category.id}`} className="cat-tile">
      <span className={`cat-visual${artwork ? " cat-artwork" : ""}`} aria-hidden="true">
        {image && failedImage !== image ? (
          <img src={image} alt="" loading="lazy" decoding="async" onError={() => setFailedImage(image)} />
        ) : (
          <span className="cat-placeholder"><IconBag size={56} /></span>
        )}
      </span>
      <span className="cat-foot">
        <span className="cat-copy">
          <span className="cat-name">{category.name}</span>
        </span>
        <span className="cat-arrow" aria-hidden="true">←</span>
      </span>
    </Link>
  );
}

function CategoryBrowser({ categories, products }: { categories: Category[]; products: Product[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });

  useEffect(() => {
    const row = track.current;
    if (!row) return;
    const sync = () => {
      const position = Math.abs(row.scrollLeft);
      const start = position < 2;
      const end = position >= row.scrollWidth - row.clientWidth - 2;
      setEdges(current => current.start === start && current.end === end ? current : { start, end });
    };
    const observer = new ResizeObserver(sync);
    observer.observe(row);
    // Card layout can change without resizing the viewport (for example when
    // styles or images finish loading), so also watch the scrollable content.
    for (const card of row.children) observer.observe(card);
    row.addEventListener("scroll", sync, { passive: true });
    row.addEventListener("load", sync, true);
    window.addEventListener("resize", sync);
    const frame = requestAnimationFrame(sync);
    sync();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      row.removeEventListener("scroll", sync);
      row.removeEventListener("load", sync, true);
      window.removeEventListener("resize", sync);
    };
  }, [categories.length]);

  const move = (direction: number) => {
    const row = track.current;
    const card = row?.firstElementChild;
    if (!row || !card) return;
    const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
    const step = card.getBoundingClientRect().width + gap;
    const visibleColumns = Math.max(1, Math.floor((row.clientWidth + gap + 1) / step));
    row.scrollBy({ left: direction * step * visibleColumns });
  };

  return <>
    <div id="home-categories" className="cat-grid" ref={track} role="region" aria-label="קטגוריות מוצרים">
      {categories.map(category => <CategoryTile key={category.id} category={category} products={products} />)}
    </div>
    <div className="cat-navigation">
      <span>{categories.length} קטגוריות<span className="cat-swipe-hint"> · החליקו לעוד</span></span>
      <div>
        <button type="button" aria-label="הקטגוריות הקודמות" aria-controls="home-categories" disabled={edges.start} onClick={() => move(1)}>→</button>
        <button type="button" className="cat-next" aria-label="הקטגוריות הבאות" aria-controls="home-categories" disabled={edges.end} onClick={() => move(-1)}><span className="cat-next-label">קטגוריות נוספות</span><span aria-hidden="true">←</span></button>
      </div>
    </div>
  </>;
}

function quantityOffer(product: Product) {
  const deal = product.deal;
  return deal && Number.isInteger(deal[0]) && deal[0] > 1 && deal[1] > 0 && deal[1] < product.price * deal[0] ? deal : null;
}

function ProfessionIcon({ id }: { id: string }) {
  return (
    <svg viewBox="0 0 32 32" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {id === "shoes" && <>
        <path d="M6 22v-5a10 10 0 0 1 20 0v5M13 15V5h6v10M8 14l-2-2m18 2 2-2" />
        <rect x="3" y="22" width="26" height="5" rx="1" />
      </>}
      {id === "kitchen" && <>
        <path d="M8 20v-5a5 5 0 0 1 1-10 8 8 0 0 1 14 0 5 5 0 0 1 1 10v5M8 20h16v7H8zM13 20v-5m6 5v-5" />
      </>}
      {id === "rep" && <>
        <path d="m11 5-8 5 4 8 3-2v11h12V16l3 2 4-8-8-5M11 5l5 5 5-5M11 5l-1 8 6-3 6 3-1-8M16 10v17" />
      </>}
      {id === "safety" && <>
        <path d="m13 5-6 20h18L19 5zM3 25h26v4H3zM11 12h10M9 19h14" />
      </>}
      {id === "disp" && <>
        <path d="M11 4h10M13 4v10L5 26a2 2 0 0 0 2 3h18a2 2 0 0 0 2-3l-8-12V4M10 20h12M13 24h1m5 2h1" />
      </>}
    </svg>
  );
}

function DealCard({ product }: { product: Product }) {
  const bundle = quantityOffer(product);
  const price = bundle ? bundle[1] : product.price;
  const previous = bundle ? product.price * bundle[0] : product.was ?? product.price;
  const saving = previous - price;
  const percent = previous > 0 ? Math.round((saving / previous) * 100) : 0;
  const fromPrice = !bundle && product.choices?.some((choice) => choice.price !== product.price);
  const image = product.imgs?.[0];
  const [failedImage, setFailedImage] = useState<string | null>(null);

  return (
    <Link href={`/p/${product.id}`} className="deal-card">
      <div className="deal-image">
        {image && failedImage !== image ? (
          <img src={image} alt="" loading="lazy" decoding="async" onError={() => setFailedImage(image)} />
        ) : (
          <span className="deal-image-fallback"><IconBag size={48} /><span>תמונת המוצר תעלה בקרוב</span></span>
        )}
        <span className="deal-badge">{bundle ? "מבצע כמות" : percent > 0 ? `${percent}% הנחה` : "במבצע"}</span>
      </div>
      <div className="deal-body">
        <h3 dir="auto">{product.name}</h3>
        <span className="deal-price-label">{bundle ? `${bundle[0]} יחידות במחיר כולל` : fromPrice ? "מחיר מבצע החל מ־" : "מחיר מבצע"}</span>
        <div className="deal-prices">
          <strong><bdi>{fmt(price)}</bdi></strong>
          {saving > 0 && <span className="deal-before">במקום <s><bdi>{fmt(previous)}</bdi></s></span>}
        </div>
        <span className="deal-saving">
          {bundle ? `${fmt(price / bundle[0])} ליחידה בקניית ${bundle[0]} יחידות` : saving > 0 ? `חיסכון של ${fmt(saving)}` : ""}
        </span>
        <span className="deal-cta">לפרטי המוצר <span aria-hidden="true">←</span></span>
      </div>
    </Link>
  );
}

function DealsCarousel({ products }: { products: Product[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState({ start: 0, count: 3 });

  useEffect(() => {
    const row = track.current;
    if (!row) return;
    const sync = () => {
      const card = row.firstElementChild;
      if (!card) return;
      const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
      const step = card.getBoundingClientRect().width + gap;
      if (!step) return;
      const count = Math.max(1, Math.round((row.clientWidth + gap) / step));
      const start = Math.min(Math.max(0, products.length - count), Math.round(Math.abs(row.scrollLeft) / step));
      setRange((current) => current.start === start && current.count === count ? current : { start, count });
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(row);
    row.addEventListener("scroll", sync, { passive: true });
    return () => {
      observer.disconnect();
      row.removeEventListener("scroll", sync);
    };
  }, [products.length]);

  const move = (direction: number) => {
    const row = track.current;
    const card = row?.firstElementChild;
    if (!row || !card) return;
    const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
    row.scrollBy({ left: direction * range.count * (card.getBoundingClientRect().width + gap) });
  };
  const end = Math.min(products.length, range.start + range.count);

  return (
    <section className="deals-band" aria-labelledby="deals-title">
      <div className="wrap">
        <div className="deals-head">
          <h2 id="deals-title" className="k sec-title">המבצעים שלנו</h2>
          <p className="deals-intro">מוצרים לעבודה. מחירים שעושים את ההבדל.</p>
        </div>
        <div id="home-deals" ref={track} className="deal-row" role="region" aria-label="מוצרים במבצע" tabIndex={0}>
          {products.map((product) => <DealCard key={product.id} product={product} />)}
        </div>
        <div className="deals-navigation">
          <span aria-live="polite" aria-atomic="true">{end === range.start + 1 ? <>מבצע {end} מתוך {products.length}</> : <>מציגים <bdi>{range.start + 1}–{end}</bdi> מתוך {products.length} מבצעים</>}</span>
          <div className="deals-buttons">
            <button type="button" aria-label="המבצעים הקודמים" aria-controls="home-deals" disabled={range.start === 0} onClick={() => move(1)}>→</button>
            <button type="button" className="deals-next" aria-label="מבצעים נוספים" aria-controls="home-deals" disabled={end === products.length} onClick={() => move(-1)}>מבצעים נוספים <span aria-hidden="true">←</span></button>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Home({ heroPreview }: { heroPreview?: "wide" | "fade" } = {}) {
  const { addMany } = useStore();
  const { products, categories, product } = useCatalog();
  const pictured = products.filter((item) => item.imgs?.[0]);
  const deals = products.filter((item) => quantityOffer(item) || (item.was && item.was > item.price)).slice(0, 7);
  const best = (pictured.length ? pictured : products).slice(0, 8);
  const shop = categories[0];
  const featured = deals[0] ?? products[0];
  const kits = KITS.filter((kit) => kit.items.every(([pid]) => product(pid)));
  const [kitId, setKitId] = useState<string | null>(null);
  const [kOff, setKOff] = useState<Record<string, boolean>>({});
  const [kSize, setKSize] = useState<Record<string, string>>({});
  const [kErr, setKErr] = useState(false);
  useScrollLock(!!kitId);

  return (
    <main>
      <section className="home-hero">
        <div className="hero">
          <div className="hero-copy">
            <div className="hero-intro">
              <span className="kicker">
                <span className="sq" />
                ביגוד ומיגון לעבודה · באר שבע
              </span>
              <h1 className="k hero-title home-hero-title">
                <span>בגדי עבודה.</span>
                <span>נעלי בטיחות.</span>
                <span>מיתוג לעסקים.</span>
              </h1>
              <p className="lead">
                <span className="hero-lead-desktop">לקנייה של פריט אחד או להזמנה ממותגת לכל הצוות — מאותו קטלוג, באותם מחירים.</span>
                <span className="hero-lead-mobile">לפריט אחד או לכל הצוות — באותם מחירים.</span>
              </p>
            </div>
            <div className="hero-conversion">
              <div className="hero-actions">
                <Link href={shop ? `/c/${shop.id}` : "/"} className="btn btn-lg">
                  לקנייה באתר
                </Link>
                <Link href="/business" className="btn btn-line btn-lg">
                  הצעת מחיר לעסק
                </Link>
              </div>
              {featured && (
              <Link href={`/p/${featured.id}`} className="hero-deal">
                <b className="k">{Math.round(featured.price)}</b>
                <span className="hero-deal-copy">
                  <span className="hero-deal-name">{featured.name}</span>
                  <span className="hero-deal-description">{featured.was ? `${fmt(featured.price)} במקום ${fmt(featured.was)}` : fmt(featured.price)}</span>
                </span>
                <span style={{ fontSize: 22, fontWeight: 700 }}>←</span>
              </Link>
              )}
            </div>
          </div>
          <div className={`hero-campaign${heroPreview ? " hero-campaign-wide" : ""}${heroPreview === "fade" ? " hero-campaign-fade" : ""}`}>
            <picture>
              <source
                media="(max-width: 767px)"
                srcSet="/images/hero/workwear-wide-v2-800.webp 800w, /images/hero/workwear-wide-v2-1536.webp 1536w"
                sizes="100vw"
                width={1536}
                height={1024}
              />
            <img
              src={heroPreview ? "/images/hero/workwear-wide-v2-1536.webp" : "/images/hero/workwear-campaign-1200.webp"}
              srcSet={heroPreview ? "/images/hero/workwear-wide-v2-800.webp 800w, /images/hero/workwear-wide-v2-1536.webp 1536w" : "/images/hero/workwear-campaign-480.webp 480w, /images/hero/workwear-campaign-800.webp 800w, /images/hero/workwear-campaign-1200.webp 1122w"}
              sizes="(max-width: 1023px) 100vw, 50vw"
              width={heroPreview ? 1536 : 1122}
              height={heroPreview ? 1024 : 1402}
              alt="איש מקצוע בחולצת פולו כחולה, מכנסי עבודה אפורים ומגפי עבודה, על רקע בטון ופס צהוב"
              fetchPriority="high"
              decoding="async"
            />
            </picture>
          </div>
        </div>
      </section>

      <section className="wrap sec home-categories" aria-labelledby="categories-title">
        <div className="sec-head">
          <h2 id="categories-title" className="k sec-title">קטגוריות</h2>
        </div>
        <CategoryBrowser categories={categories} products={products} />
      </section>

      {deals.length > 0 && <DealsCarousel products={deals} />}

      <section className="wrap sec">
        <div className="sec-head">
          <h2 className="k sec-title">הנמכרים ביותר</h2>
          <Link href={shop ? `/c/${shop.id}` : "/"} className="text-link">
            לכל המוצרים
          </Link>
        </div>
        <div className="product-grid home">
          {best.map((p) => (
            <ProductTile key={p.id} p={p} />
          ))}
        </div>
      </section>

      {kits.length > 0 && <section className="wrap sec">
        <div className="sec-head">
          <h2 className="k sec-title">ערכות עבודה</h2>
          <p className="muted" style={{ margin: 0, fontSize: 16, maxWidth: "38ch", lineHeight: 1.5 }}>
            סטים מוכנים מהקטלוג, עם מבצעי הכמות כבר בפנים. בוחרים מידות ומוסיפים הכל בלחיצה.
          </p>
        </div>
        <div className="kit-grid">
          {kits.map((k) => {
            let total = 0;
            let regular = 0;
            k.items.forEach(([pid, q]) => {
              const item = product(pid);
              if (!item) return;
              total += priceFor(item, q);
              regular += q * item.price;
            });
            return (
              <div key={k.id} className="kit">
                <div className="kit-thumbs">
                  {k.items.map(([pid, q]) => {
                    const p = product(pid);
                    if (!p) return null;
                    const img = p.imgs?.[0];
                    return (
                      <div key={pid} className="kit-th">
                        {img ? <img src={img} alt="" /> : <span className="k" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34, color: "#cfcfca" }}>{phOf(p)}</span>}
                        <span className="qty-tag">×{q}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="kit-body">
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontSize: 24, fontWeight: 800 }}>{k.name}</span>
                    <span className="muted" style={{ fontSize: 14, lineHeight: 1.5 }}>
                      {k.items.map(([pid, q]) => (q > 1 ? `${q} × ` : "") + (product(pid)?.name || "")).join(" · ")}
                    </span>
                  </div>
                  <div style={{ marginTop: "auto", display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                        <span style={{ fontSize: 26, fontWeight: 800 }}>{fmt(total)}</span>
                        <s className="was" style={{ fontSize: 15 }}>{fmt(regular)}</s>
                      </span>
                      <span className="save-tag y">חיסכון {fmt(regular - total)}</span>
                    </span>
                    <button
                      className="btn"
                      style={{ height: 50, padding: "0 20px", fontSize: 15 }}
                      onClick={() => {
                        setKitId(k.id);
                        setKOff({});
                        setKSize({});
                        setKErr(false);
                      }}
                    >
                      בחירת מידות
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>}

      <section className="wrap sec">
        <div className="b2b-banner">
          <div className="b2b-copy">
            <span className="kicker">
              <span className="sq" />
              לעסקים וארגונים
            </span>
            <h2 className="k b2b-title">
              הלוגו שלכם.
              <br />
              על כל הצוות.
            </h2>
            <p style={{ fontSize: 17, lineHeight: 1.6, color: "#cfcfca", margin: 0, maxWidth: "44ch" }}>
              שירותי מיתוג הכוללים הדפסה ורקמה בהתאמה אישית — על חולצות, פליזים, מעילים וכובעים, בכל כמות ובשילוב מידות.
            </p>
            <div className="steps3">
              {[
                ["01", "בוחרים פריטים"],
                ["02", "מצרפים לוגו ומידות"],
                ["03", "מקבלים הצעת מחיר"],
              ].map(([n, t]) => (
                <div key={n} className="step-cell">
                  <span className="k step-num">{n}</span>
                  <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.35 }}>{t}</span>
                </div>
              ))}
            </div>
            <Link href="/business" className="btn btn-yellow btn-lg" style={{ alignSelf: "flex-start", padding: "0 30px" }}>
              לבקשת הצעת מחיר
            </Link>
          </div>
          <div className="b2b-photo">
            <img src={IM.k87} alt="חולצת טי עם כיס לעבודה K87" />
          </div>
        </div>
      </section>

      <section className="wrap sec professions" aria-labelledby="professions-title">
        <div className="professions-head">
          <h2 id="professions-title" className="k sec-title">לפי מקצוע</h2>
          <p>מה לובשים לעבודה שלכם? בחרו תחום ומצאו את הציוד המתאים.</p>
        </div>
        <div className="jobs">
          {PROFESSIONS.map((pr) => (
            <Link key={pr.id} href={categories.some((item) => item.id === pr.id) ? `/c/${pr.id}` : shop ? `/c/${shop.id}` : "/"} className="job">
              <span className="job-icon"><ProfessionIcon id={pr.id} /></span>
              <span className="job-copy">
                <span className="job-name">{pr.name}</span>
                <span className="job-description">{pr.desc}</span>
              </span>
              <span className="job-arrow" aria-hidden="true">←</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="wrap sec">
        <div className="brands">
          {BRANDS.map((b) => (
            <Link key={b.name} href={categories.some((item) => item.id === b.id) ? `/c/${b.id}` : shop ? `/c/${shop.id}` : "/"} className="brand">
              {b.name}
            </Link>
          ))}
        </div>
      </section>

      <section className="wrap" style={{ paddingTop: "clamp(56px, 7vw, 96px)" }}>
        <div className="trust">
          <div className="trust-item">
            <span className="trust-ico">
              <IconTruck />
            </span>
            <span>
              <b style={{ display: "block", fontSize: 17 }}>משלוח עד הבית</b>
              <span className="muted" style={{ fontSize: 14 }}>חינם בהזמנות מעל {fmt(FREE_SHIPPING)}</span>
            </span>
          </div>
          <div className="trust-item">
            <span className="trust-ico">
              <IconPin />
            </span>
            <span>
              <b style={{ display: "block", fontSize: 17 }}>סניף בבאר שבע</b>
              <span className="muted" style={{ fontSize: 14 }}>הפועלים 20 — מוזמנים למדוד</span>
            </span>
          </div>
          <div className="trust-item">
            <span className="trust-ico">
              <IconLock />
            </span>
            <span>
              <b style={{ display: "block", fontSize: 17 }}>תשלום מאובטח</b>
              <span className="muted" style={{ fontSize: 14 }}>כל אמצעי התשלום המקובלים</span>
            </span>
          </div>
          <div className="trust-item">
            <span className="trust-ico">
              <IconPhone />
            </span>
            <span>
              <b style={{ display: "block", fontSize: 17 }}>ייעוץ בטלפון</b>
              <a href="tel:08-6233803" style={{ fontSize: 14, fontWeight: 700, direction: "ltr", textAlign: "right", textDecoration: "underline" }}>
                08-6233803
              </a>
            </span>
          </div>
        </div>
      </section>

      {kitId && (
        <KitSheet
          kitId={kitId}
          kOff={kOff}
          kSize={kSize}
          kErr={kErr}
          setKOff={setKOff}
          setKSize={setKSize}
          setKErr={setKErr}
          onClose={() => setKitId(null)}
          onAdd={(list) => {
            addMany(list, true);
            setKitId(null);
          }}
        />
      )}
    </main>
  );
}

function KitSheet(props: {
  kitId: string;
  kOff: Record<string, boolean>;
  kSize: Record<string, string>;
  kErr: boolean;
  setKOff: (v: Record<string, boolean>) => void;
  setKSize: (v: Record<string, string>) => void;
  setKErr: (v: boolean) => void;
  onClose: () => void;
  onAdd: (list: [string, number, string, number][]) => void;
}) {
  const { product } = useCatalog();
  const kit = KITS.find((k) => k.id === props.kitId);
  const view = useMemo(() => {
    if (!kit) return null;
    let total = 0;
    let regular = 0;
    let count = 0;
    const rows = kit.items.map(([pid, qty]) => {
      const p = product(pid);
      if (!p) return null;
      const on = !props.kOff[pid];
      const multi = p.sizes.length > 1;
      const size = multi ? props.kSize[pid] || "" : p.sizes[0];
      const pr = priceFor(p, qty);
      if (on) {
        total += pr;
        regular += qty * p.price;
        count += qty;
      }
      return { p, qty, on, multi, size, pr, count };
    });
    return { rows: rows.filter((row): row is NonNullable<typeof row> => row !== null), total, regular, count };
  }, [kit, product, props.kOff, props.kSize]);

  if (!kit || !view) return null;

  return (
    <>
      <div className="backdrop on" onClick={props.onClose} />
      <section className="sheet" aria-label={kit.name}>
        <div className="sheet-h">
          <span style={{ fontSize: 18, fontWeight: 800 }}>{kit.name}</span>
          <button className="x" onClick={props.onClose} aria-label="סגירה">
            ×
          </button>
        </div>
        <div className="sheet-b">
          <div>
            {view.rows.map((r) => (
              <div key={r.p.id} className="bundle-row" style={{ paddingInline: 0, opacity: r.on ? 1 : 0.45, gridTemplateColumns: "24px 64px minmax(0,1fr)" }}>
                <button
                  className={`tick ${r.on ? "on" : ""}`}
                  aria-label="בחירה"
                  onClick={() => props.setKOff({ ...props.kOff, [r.p.id]: !props.kOff[r.p.id] })}
                >
                  {r.on && <IconCheck />}
                </button>
                <div className="mini-ph" style={{ width: 64, height: 70 }}>
                  {r.p.imgs?.[0] ? <img src={r.p.imgs[0]} alt="" /> : <span className="k" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#bdbdb7" }}>{phOf(r.p)}</span>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 700 }}>{r.p.name}</span>
                    <span style={{ fontSize: 15, fontWeight: 800 }}>{fmt(r.pr)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                    <span className="muted" style={{ fontSize: 13 }}>{r.qty > 1 ? `${r.qty} יחידות` : "יחידה אחת"}</span>
                    {r.multi && (
                      <select
                        className="plain"
                        style={{ height: 36, minWidth: 88, boxShadow: `inset 0 0 0 1px ${props.kErr && r.on && !r.size ? "#B3261E" : "#CFCFCA"}`, border: 0 }}
                        value={r.size}
                        onChange={(e) => {
                          props.setKSize({ ...props.kSize, [r.p.id]: e.target.value });
                          props.setKErr(false);
                        }}
                      >
                        <option value="">מידה</option>
                        {r.p.sizes.map((z) => (
                          <option key={z} value={z}>
                            {z}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {props.kErr && <span className="err">בחרו מידה לכל פריט מסומן בערכה</span>}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <span style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: 24, fontWeight: 800 }}>{fmt(view.total)}</span>
                <s className="was">{fmt(view.regular)}</s>
              </span>
              <span style={{ fontSize: 13, fontWeight: 700 }}>חיסכון {fmt(view.regular - view.total)}</span>
            </span>
            <button
              className="btn"
              style={{ flex: 1, maxWidth: 280, height: 56, fontSize: 16 }}
              onClick={() => {
                const sel = view.rows.filter((r) => r.on);
                if (sel.some((r) => r.multi && !r.size)) {
                  props.setKErr(true);
                  return;
                }
                props.onAdd(sel.map((r) => [r.p.id, 0, r.multi ? r.size : r.p.sizes[0], r.qty]));
              }}
            >
              הוספת {view.count} פריטים לסל
            </button>
          </div>
        </div>
      </section>
    </>
  );
}

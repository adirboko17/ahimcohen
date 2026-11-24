"use client";

import { ProductImage } from "./ProductImage";
import { ProductBrand } from "./ProductBrand";
import { HeroDeals } from "./HeroDeals";
import { HeroPromotions } from "./HeroPromotions";
import { EmbroideryBanner } from "./EmbroideryBanner";
import { NewArrivalsStrip } from "./NewArrivalsStrip";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { FREE_SHIPPING, KITS, phOf, type Product } from "@/lib/catalog";
import { BrandGrid } from "./BrandGrid";
import { useCatalog } from "@/lib/catalog-context";
import type { AdminBundle, AdminHero } from "@/lib/admin/models";
import { fmt, priceFor } from "@/lib/pricing";
import { productSizeOptions } from "@/lib/sizes";
import { useScrollLock, useStore } from "@/lib/store";
import { IconBag, IconCheck, IconLock, IconPhone, IconPin, IconTruck } from "./icons";
import { ProductTile } from "./ProductTile";

const parkesId = "parkes-zip-מגף-בטיחות-s3-אוסטרלי-עם-שרוך-ורוכסן";
const softshellId = "מעיל-סופטשל-טקטי-עם-כובע-נשלף";
const productScenes: Record<string, string | undefined> = {
  [parkesId]: "parkes-workshop",
  [softshellId]: "softshell-yard",
};

function bannerProduct(products: Product[], categoryId: string, subcategory: string, preferredId: string) {
  const candidates = products.filter((item) =>
    item.cat === categoryId && (item.sub === subcategory || item.subs?.includes(subcategory))
    && item.imgs?.[0] && item.choices?.some((choice) => choice.available)
  );
  return candidates.find((item) => item.id === preferredId) ?? candidates[0];
}

function BannerProductPhoto({ item }: { item: Product }) {
  const scene = productScenes[item.id];
  return (
    <Link href={`/p/${encodeURIComponent(item.id)}`} className="banner-product-photo" data-scene={scene}>
      {scene ? (
        <picture>
          <source media="(max-width: 767px)" srcSet={`/images/hero/${scene}-mobile.webp?v=2`} />
          <img src={`/images/hero/${scene}.webp`} alt={item.name} loading="lazy" decoding="async" />
        </picture>
      ) : <ProductImage src={item.imgs?.[0]} alt={item.name} sizes="(max-width: 767px) 100vw, 50vw" maxWidth={1280} />}
    </Link>
  );
}

function quantityOffer(product: Product) {
  const deal = product.deal;
  return deal && Number.isInteger(deal[0]) && deal[0] > 1 && deal[1] > 0 && deal[1] < product.price * deal[0] ? deal : null;
}

function DealCard({ product, duplicate = false }: { product: Product; duplicate?: boolean }) {
  const bundle = quantityOffer(product);
  const price = bundle ? bundle[1] : product.price;
  const previous = bundle ? product.price * bundle[0] : product.was ?? product.price;
  const saving = previous - price;
  const percent = previous > 0 ? Math.round((saving / previous) * 100) : 0;
  const fromPrice = !bundle && product.choices?.some((choice) => choice.price !== product.price);
  const image = product.imgs?.[0];
  const [failedImage, setFailedImage] = useState<string | null>(null);

  return (
    <Link href={`/p/${product.id}`} className="deal-card" aria-hidden={duplicate || undefined} tabIndex={duplicate ? -1 : undefined}>
      <div className="deal-image">
        {image && failedImage !== image ? (
          <ProductImage src={image} sizes="(max-width: 767px) 42vw, 200px" maxWidth={640} alt="" loading="lazy" decoding="async" onError={() => setFailedImage(image)} />
        ) : (
          <span className="deal-image-fallback"><IconBag size={48} /><span>תמונת המוצר תעלה בקרוב</span></span>
        )}
        <span className="deal-badge">{bundle ? "מארז במבצע" : percent > 0 ? `${percent}% הנחה` : "במבצע"}</span>
        <ProductBrand name={product.brand} />
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

function DealsMarquee() {
  const viewport = useRef<HTMLDivElement>(null);
  const firstItem = useRef<HTMLSpanElement>(null);
  const [repeatCount, setRepeatCount] = useState<number | null>(null);
  const itemCount = repeatCount ?? 8;

  useEffect(() => {
    const band = viewport.current;
    const item = firstItem.current;
    if (!band || !item) return;

    const fit = () => {
      const width = item.getBoundingClientRect().width;
      // Keep one extra item in view after shifting an entire item to the left.
      if (width > 0) setRepeatCount(Math.ceil(band.getBoundingClientRect().width / width) + 1);
    };
    const observer = new ResizeObserver(fit);
    observer.observe(band);
    observer.observe(item);
    fit();
    return () => observer.disconnect();
  }, []);

  return <div ref={viewport} className="deals-marquee" aria-hidden="true">
    <div className="deals-marquee-track" data-ready={repeatCount !== null} style={{ "--marquee-items": itemCount } as CSSProperties}>
      {Array.from({ length: itemCount }, (_, index) => (
        <span className="k deals-marquee-item" key={index} ref={index === 0 ? firstItem : undefined}>המבצעים שלנו <i>✦</i></span>
      ))}
    </div>
  </div>;
}

function DealsCarousel({ products }: { products: Product[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState({ start: 0, count: 3 });
  const [reducedMotion, setReducedMotion] = useState(true);
  const playing = !reducedMotion;
  const looping = products.length > range.count;

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotion = () => setReducedMotion(preference.matches);
    syncMotion();
    preference.addEventListener("change", syncMotion);
    return () => {
      preference.removeEventListener("change", syncMotion);
    };
  }, []);

  useEffect(() => {
    if (!playing || products.length <= range.count) return;
    const timer = window.setInterval(() => {
      const row = track.current;
      const card = row?.firstElementChild;
      if (!row || !card) return;
      const step = card.getBoundingClientRect().width + (parseFloat(getComputedStyle(row).columnGap) || 0);
      row.scrollBy({ left: -step, behavior: "smooth" });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [playing, products.length, range.count]);

  useEffect(() => {
    const row = track.current;
    if (!row) return;
    let settleTimer: ReturnType<typeof setTimeout>;
    // The second set continues the first. Once scrolling settles there, shift
    // to the identical position in the first set without a visible rewind.
    const normalize = () => {
      const card = row.firstElementChild;
      if (!card || !looping) return;
      const step = card.getBoundingClientRect().width + (parseFloat(getComputedStyle(row).columnGap) || 0);
      const cycle = step * products.length;
      const position = Math.abs(row.scrollLeft);
      if (cycle > 0 && position >= cycle - 1) {
        row.scrollTo({ left: -Math.max(0, position - cycle), behavior: "instant" });
      }
    };
    const sync = () => {
      const card = row.firstElementChild;
      if (!card) return;
      const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
      const step = card.getBoundingClientRect().width + gap;
      if (!step) return;
      const count = Math.max(1, Math.round((row.clientWidth + gap) / step));
      const start = Math.round(Math.abs(row.scrollLeft) / step) % products.length;
      setRange((current) => current.start === start && current.count === count ? current : { start, count });
      clearTimeout(settleTimer);
      settleTimer = setTimeout(normalize, 150);
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(row);
    row.addEventListener("scroll", sync, { passive: true });
    return () => {
      observer.disconnect();
      clearTimeout(settleTimer);
      row.removeEventListener("scroll", sync);
    };
  }, [products.length, looping]);

  const move = (direction: number) => {
    const row = track.current;
    const card = row?.firstElementChild;
    if (!row || !card) return;
    const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
    const step = card.getBoundingClientRect().width + gap;
    const distance = range.count * step;
    // Going backward across the start uses the matching copy first.
    if (direction > 0 && Math.abs(row.scrollLeft) < distance) {
      row.scrollTo({ left: row.scrollLeft - products.length * step, behavior: "instant" });
    }
    row.scrollBy({ left: direction * distance, behavior: reducedMotion ? "instant" : "smooth" });
  };

  return (
    <section className="deals-band" aria-labelledby="deals-title" data-playing={playing}>
      <DealsMarquee />
      <div className="wrap">
        <h2 id="deals-title" className="deals-accessible-title">המבצעים שלנו</h2>
        <div id="home-deals" ref={track} className="deal-row" role="region" aria-roledescription="קרוסלה" aria-label="מוצרים במבצע" tabIndex={0}>
          {products.map((product) => <DealCard key={product.id} product={product} />)}
          {looping && products.map((product) => <DealCard key={`loop-${product.id}`} product={product} duplicate />)}
        </div>
        <div className="deals-navigation">
          <span aria-live={playing ? "off" : "polite"} aria-atomic="true">מבצע {range.start + 1} מתוך {products.length}</span>
          <div className="deals-buttons">
            <button type="button" aria-label="המבצעים הקודמים" aria-controls="home-deals" disabled={!looping} onClick={() => move(1)}>→</button>
            <button type="button" className="deals-next" aria-label="מבצעים נוספים" aria-controls="home-deals" disabled={!looping} onClick={() => move(-1)}>מבצעים נוספים <span aria-hidden="true">←</span></button>
          </div>
        </div>
      </div>
    </section>
  );
}

type Kit = Pick<AdminBundle, "id" | "name" | "items" | "total" | "bundleProductId"> & { cartProductId?: string };

export function Home({ heroPreview, promotions = [], bundles = [], showNewArrivals = false }: {
  heroPreview?: "wide" | "fade";
  promotions?: AdminHero[];
  bundles?: Kit[];
  showNewArrivals?: boolean;
} = {}) {
  const { addMany } = useStore();
  const { products, categories, product } = useCatalog();
  const pictured = products.filter((item) => item.imgs?.[0]);
  const deals = products.filter((item) => !item.quantityOfferHidden && (quantityOffer(item) || (item.was && item.was > item.price))).slice(0, 7);
  const best = (pictured.length ? pictured : products).slice(0, 8);
  const shop = categories[0];
  const footwear = categories.find((category) => category.id === "shoes");
  const winter = categories.find((category) => category.id === "winter");
  const boot = bannerProduct(products, "shoes", "נעלי בטיחות", parkesId);
  const jacket = bannerProduct(products, "winter", "מעילים", softshellId);
  const winterLinks = (winter?.subs ?? []).slice(0, 3).map((name) => ({
    name,
    image: products.find((item) => item.cat === winter?.id && item.sub === name && item.imgs?.[0])?.imgs?.[0],
  }));
  const allKits: Kit[] = [...bundles, ...KITS];
  const kits = allKits.filter((kit) => kit.items.every(([pid]) => product(pid)) && (!kit.bundleProductId || product(kit.bundleProductId))
    && (!kit.cartProductId || product(kit.cartProductId)));
  const [kitId, setKitId] = useState<string | null>(null);
  const [kOff, setKOff] = useState<Record<string, boolean>>({});
  const [kSize, setKSize] = useState<Record<string, string>>({});
  const [kErr, setKErr] = useState(false);
  const selectedKit = kits.find((kit) => kit.id === kitId);
  useScrollLock(!!selectedKit);
  return (
    <main>
      <section className="home-hero">
        {promotions.length ? <HeroPromotions promotions={promotions} /> : <div className="hero">
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
                <span className="hero-lead-desktop">לקנייה של פריט אחד או להזמנה ממותגת לכל הצוות - מאותו קטלוג, באותם מחירים.</span>
                <span className="hero-lead-mobile">לפריט אחד או לכל הצוות - באותם מחירים.</span>
              </p>
            </div>
            <div className="hero-conversion">
              <div className="hero-actions">
                <Link href="/offers" className="btn btn-lg">
                  למבצעים שלנו
                </Link>
                <Link href="/business" className="btn btn-line btn-lg">
                  הצעת מחיר לעסק
                </Link>
              </div>
              <HeroDeals products={products} />
              <ul className="hero-services" aria-label="השירותים שלנו" role="list">
                <li>
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true" focusable="false">
                    <path d="m8 4-6 4 3 5 3-2v10h8V11l3 2 3-5-6-4a4 4 0 0 1-8 0Z" />
                    <path d="M10 13h4m-4 3h4" />
                  </svg>
                  <span>הדפסה ורקמה</span>
                </li>
                <li>
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true" focusable="false">
                    <circle cx="9" cy="7" r="3" />
                    <path d="M2 21v-2a7 7 0 0 1 14 0v2M16 4a3 3 0 0 1 0 6m2 4a6 6 0 0 1 4 5v2" />
                  </svg>
                  <span>הזמנות לצוותים</span>
                </li>
                <li>
                  <IconPin />
                  <span>איסוף מבאר שבע</span>
                </li>
              </ul>
            </div>
          </div>
          <div className={`hero-campaign${heroPreview ? " hero-campaign-wide" : ""}${heroPreview === "fade" ? " hero-campaign-fade" : ""}`}>
            <picture>
              <source
                media="(max-width: 767px)"
                srcSet="/images/hero/workwear-boot-800.webp?v=2 800w, /images/hero/workwear-boot-1200.webp?v=2 1200w"
                sizes="100vw"
                width={1200}
                height={1055}
              />
              <source
                media="(max-width: 1023px)"
                srcSet="/images/hero/workwear-boot-desktop-1024.webp 1024w, /images/hero/workwear-boot-desktop-1536.webp 1536w"
                sizes="100vw"
                width={1536}
                height={1023}
              />
            <img
              src="/images/hero/workwear-boot-desktop-1536.webp"
              srcSet="/images/hero/workwear-boot-desktop-1024.webp 1024w, /images/hero/workwear-boot-desktop-1536.webp 1536w"
              sizes="(max-width: 767px) 100vw, 50vw"
              width={1536}
              height={1023}
              alt="איש מקצוע בחולצת פולו כחולה, מכנסי עבודה אפורים ומגפי עבודה, על רקע בטון ופס צהוב"
              fetchPriority="high"
              decoding="async"
            />
            </picture>
          </div>
        </div>}
      </section>

      {showNewArrivals && <NewArrivalsStrip products={products} />}

      <section id="our-brands" className="wrap sec home-brands" aria-labelledby="brands-title">
        <div className="sec-head">
          <h2 id="brands-title" className="k sec-title">המותגים שלנו</h2>
          <Link href="/brands" className="text-link">לכל המותגים <span aria-hidden="true">←</span></Link>
        </div>
        <p className="brands-intro">בוחרים מותג ומגלים את כל המוצרים שלו.</p>
        <BrandGrid featured />
      </section>

      {footwear && boot && (
        <section className="footwear-banner" aria-labelledby="footwear-title">
          <BannerProductPhoto item={boot} />
          <div className="footwear-banner-copy">
            <p className="footwear-category">{footwear.name}</p>
            <h2 id="footwear-title" className="k">יום עבודה מתחיל<br /> <em>בצעד הנכון.</em></h2>
            <Link href="/c/shoes" className="btn btn-yellow">
              לכל נעלי העבודה <span aria-hidden="true">←</span>
            </Link>
          </div>
        </section>
      )}

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

      {winter && jacket && (
        <section className="winter-banner" aria-labelledby="winter-banner-title">
          <div className="winter-banner-hero">
            <BannerProductPhoto item={jacket} />
            <div className="winter-banner-copy">
              <span className="kicker"><span className="sq" />{winter.name}</span>
              <h2 id="winter-banner-title" className="k">קר בחוץ.<br /><em>ממשיכים לעבוד.</em></h2>
              <Link href={`/c/${winter.id}`} className="btn btn-yellow">
                לכל ביגוד החורף <span aria-hidden="true">←</span>
              </Link>
            </div>
          </div>
          {winterLinks.length > 0 && <div className="winter-banner-links">
            {winterLinks.map(({ name, image }) => (
              <Link key={name} href={`/c/${winter.id}?sub=${encodeURIComponent(name)}`}>
                {image && <ProductImage src={image} maxWidth={1280} sizes={`${Math.ceil(100 / winterLinks.length)}vw`} alt="" />}
                <span>{name}</span><span aria-hidden="true">←</span>
              </Link>
            ))}
          </div>}
        </section>
      )}

      {kits.length > 0 && <section className="wrap sec">
        <div className="sec-head">
          <h2 className="k sec-title">ערכות עבודה</h2>
          <p className="muted" style={{ margin: 0, fontSize: 16, maxWidth: "38ch", lineHeight: 1.5 }}>
            בוחרים צבע ומידה ומוסיפים לסל.
          </p>
        </div>
        <div className="kit-grid">
          {kits.map((k) => {
            let calculatedTotal = 0;
            let regular = 0;
            k.items.forEach(([pid, q]) => {
              const item = product(pid);
              if (!item) return;
              calculatedTotal += priceFor(item, q);
              regular += q * item.price;
            });
            const packProduct = k.bundleProductId ? product(k.bundleProductId) : undefined;
            const total = packProduct?.price ?? k.total ?? calculatedTotal;
            return (
              <div key={k.id} className="kit" data-priced={!!packProduct || k.total !== undefined || undefined}>
                <div className="kit-thumbs">
                  {k.items.map(([pid, q]) => {
                    const p = product(pid);
                    if (!p) return null;
                    const img = packProduct?.imgs?.[0] ?? p.imgs?.[0];
                    return (
                      <div key={pid} className="kit-th">
                        {img ? <ProductImage src={img} alt="" /> : <span className="k" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34, color: "#cfcfca" }}>{phOf(p)}</span>}
                        <span className="qty-tag">×{q}</span>
                        <ProductBrand name={p.brand} />
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
                        {regular > total && <s className="was" style={{ fontSize: 15 }}>{fmt(regular)}</s>}
                      </span>
                      {regular > total && <span className="save-tag y">חיסכון {fmt(regular - total)}</span>}
                    </span>
                    {packProduct || k.total !== undefined ? <Link className="btn" style={{ height: 50, padding: "0 20px", fontSize: 15 }}
                      href={packProduct ? `/p/${encodeURIComponent(packProduct.id)}` : `/p/${encodeURIComponent(k.items[0][0])}?bundle=${encodeURIComponent(k.id)}`}>
                      {packProduct ? "למארז" : "בחירת מידות"}
                    </Link> : <button
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
                    </button>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>}

      <section className="wrap sec b2b-section">
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
              שירותי מיתוג הכוללים הדפסה ורקמה בהתאמה אישית - על חולצות, פליזים, מעילים וכובעים, בכל כמות ובשילוב מידות.
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
          <EmbroideryBanner />
        </div>
      </section>



      <section className="wrap" style={{ paddingTop: "clamp(56px, 7vw, 96px)" }}>
        <div className="trust">
          <div className="trust-item">
            <span className="trust-ico">
              <IconTruck />
            </span>
            <span>
              <b className="trust-title">משלוח עד הבית</b>
              <span className="muted trust-detail">חינם בהזמנות מעל {fmt(FREE_SHIPPING)}</span>
            </span>
          </div>
          <div className="trust-item">
            <span className="trust-ico">
              <IconPin />
            </span>
            <span>
              <b className="trust-title">סניף בבאר שבע</b>
              <span className="muted trust-detail">הפועלים 20 - מוזמנים למדוד</span>
            </span>
          </div>
          <div className="trust-item">
            <span className="trust-ico">
              <IconLock />
            </span>
            <span>
              <b className="trust-title">תשלום מאובטח</b>
              <span className="muted trust-detail">כל אמצעי התשלום המקובלים</span>
            </span>
          </div>
          <div className="trust-item">
            <span className="trust-ico">
              <IconPhone />
            </span>
            <span>
              <b className="trust-title">ייעוץ בטלפון</b>
              <a href="tel:08-6233803" style={{ fontSize: 14, fontWeight: 700, direction: "ltr", textAlign: "right", textDecoration: "underline" }}>
                08-6233803
              </a>
            </span>
          </div>
        </div>
      </section>

      {selectedKit && (
        <KitSheet
          key={selectedKit.id}
          kit={selectedKit}
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
  kit: Kit;
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
  const { kit } = props;
  const fixedPrice = kit.total !== undefined;
  const [colors, setColors] = useState<Record<string, number>>({});
  const view = useMemo(() => {
    let total = 0;
    let regular = 0;
    let count = 0;
    const rows = kit.items.map(([pid, qty]) => {
      const p = product(pid);
      if (!p) return null;
      const on = fixedPrice || !props.kOff[pid];
      const availableColor = p.choices?.find((choice) => choice.available)?.color;
      const color = colors[pid] ?? Math.max(0, p.colors.indexOf(availableColor ?? ""));
      const sizes = productSizeOptions(p, p.colors[color] || "").filter((option) => option.available);
      const size = sizes.find((option) => option.value === props.kSize[pid])?.value ?? (sizes.length === 1 ? sizes[0].value : "");
      const pr = kit.total ?? priceFor(p, qty);
      if (on) {
        total += pr;
        regular += qty * p.price;
        count += qty;
      }
      return { p, qty, on, sizes, size, color, pr };
    });
    return { rows: rows.filter((row): row is NonNullable<typeof row> => row !== null), total, regular, count };
  }, [kit, fixedPrice, product, colors, props.kOff, props.kSize]);

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
              <div key={r.p.id} className="bundle-row" style={{ paddingInline: 0, opacity: r.on ? 1 : 0.45, gridTemplateColumns: fixedPrice ? "64px minmax(0,1fr)" : "24px 64px minmax(0,1fr)" }}>
                {!fixedPrice && <button
                  className={`tick ${r.on ? "on" : ""}`}
                  aria-label="בחירה"
                  onClick={() => props.setKOff({ ...props.kOff, [r.p.id]: !props.kOff[r.p.id] })}
                >
                  {r.on && <IconCheck />}
                </button>}
                <div className="mini-ph" style={{ width: 64, height: 70 }}>
                  {r.p.imgs?.[0] ? <ProductImage src={r.p.imgs[0]} alt="" /> : <span className="k" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#bdbdb7" }}>{phOf(r.p)}</span>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                  <ProductBrand name={r.p.brand} inline />
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 700 }}>{r.p.name}</span>
                    <span style={{ fontSize: 15, fontWeight: 800 }}>{fmt(r.pr)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span className="muted" style={{ fontSize: 13 }}>{r.qty > 1 ? `${r.qty} יחידות` : "יחידה אחת"}</span>
                    {r.p.colors.length > 1 && <select className="plain" aria-label={`צבע עבור ${r.p.name}`} value={r.color} onChange={(event) => {
                      setColors((current) => ({ ...current, [r.p.id]: Number(event.target.value) }));
                      props.setKErr(false);
                    }}>{r.p.colors.map((color, index) => <option key={color} value={index}>{color}</option>)}</select>}
                    {(r.sizes.length !== 1) && (
                      <select
                        className="plain"
                        aria-label={`מידה עבור ${r.p.name}`}
                        style={{ height: 36, minWidth: 88, boxShadow: `inset 0 0 0 1px ${props.kErr && r.on && !r.size ? "#B3261E" : "#CFCFCA"}`, border: 0 }}
                        value={r.size}
                        onChange={(e) => {
                          props.setKSize({ ...props.kSize, [r.p.id]: e.target.value });
                          props.setKErr(false);
                        }}
                      >
                        <option value="">מידה</option>
                        {r.sizes.map((option) => (
                          <option key={option.label} value={option.value}>
                            {option.label}
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
                {view.regular > view.total && <s className="was">{fmt(view.regular)}</s>}
              </span>
              {view.regular > view.total && <span style={{ fontSize: 13, fontWeight: 700 }}>חיסכון {fmt(view.regular - view.total)}</span>}
            </span>
            <button
              className="btn"
              style={{ flex: 1, maxWidth: 280, height: 56, fontSize: 16 }}
              onClick={() => {
                const sel = view.rows.filter((r) => r.on);
                if (sel.some((r) => !r.size)) {
                  props.setKErr(true);
                  return;
                }
                props.onAdd(sel.map((r) => [r.p.id, r.color, r.size, r.qty]));
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

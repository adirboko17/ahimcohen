"use client";

import { ProductImage } from "./ProductImage";
import { ProductBrand } from "./ProductBrand";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { FREE_SHIPPING, phOf, swatchColor, colorLabel } from "@/lib/catalog";
import { useCatalog } from "@/lib/catalog-context";
import { categoryProductImage } from "@/lib/category-filters";
import { fmt } from "@/lib/pricing";
import { productSizeOptions, sizeLabel } from "@/lib/sizes";
import { useScrollLock, useStore } from "@/lib/store";
import { IconBack, IconBag, IconCase, IconCheck, IconFwd, IconLock, IconPackages, IconPin, IconSearch, IconTruck, IconUser } from "./icons";
import { CartContents } from "./CartContents";
import { CheckoutButton } from "./CheckoutButton";

export function Overlays() {
  const [paying, setPaying] = useState(false);
  const path = usePathname();
  const s = useStore();
  const [searchPresent, setSearchPresent] = useState(false);
  const [drawerPresent, setDrawerPresent] = useState(false);
  const drawerOpen = s.cartOpen || s.menuOpen;
  useEffect(() => {
    if (drawerOpen) {
      setDrawerPresent(true);
      return;
    }
    if (!window.matchMedia("(max-width: 767px) and (prefers-reduced-motion: no-preference)").matches) {
      setDrawerPresent(false);
      return;
    }
    // Match the drawer's exit transition; reopening cancels the release.
    const timer = window.setTimeout(() => setDrawerPresent(false), 450);
    return () => window.clearTimeout(timer);
  }, [drawerOpen]);
  const anotherOverlay = s.cartOpen || s.menuOpen || !!s.sheet;
  useEffect(() => {
    if (s.searchOpen) {
      setSearchPresent(true);
      return;
    }
    if (anotherOverlay || !window.matchMedia("(max-width: 767px) and (prefers-reduced-motion: no-preference)").matches) {
      setSearchPresent(false);
      return;
    }
    // Retain the panel for its exit animation; cancel on a rapid reopen.
    const timer = window.setTimeout(() => setSearchPresent(false), 220);
    return () => window.clearTimeout(timer);
  }, [s.searchOpen, anotherOverlay]);
  const searchLeaving = searchPresent && !s.searchOpen && !anotherOverlay;
  useScrollLock(drawerOpen || drawerPresent || (searchPresent && !anotherOverlay));
  const { categories, products, category, product } = useCatalog();
  const count = s.cart.reduce((a, l) => a + l.qty, 0);
  const math = s.pricing;
  const priceReady = !!s.cartQuote.quote;
  const open = anotherOverlay || drawerPresent || s.searchOpen || searchLeaving;
  const buy = path.startsWith("/p/");
  const tabs = path === "/" || path.startsWith("/c/") || path.startsWith("/business") || path.startsWith("/account");

  return (
    <>
      <div className={`backdrop ${open ? "on" : ""}`} onClick={s.closeAll} />
      <aside className={`drawer cart ${s.cartOpen ? "on" : ""}`} aria-label="סל הקניות" aria-hidden={!s.cartOpen} inert={!s.cartOpen}>
        <div className="drawer-h cart-header">
          <div className="cart-title">
            <span className="cart-eyebrow">COHEN BROTHERS / בדרך אליכם</span>
            <h2>הסל שלך <span className="cart-item-count" aria-label={`${count} פריטים בסל`}>{count}</span></h2>
          </div>
          <button className="x" onClick={s.closeAll} aria-label="סגירה">
            ×
          </button>
        </div>
        {count > 0 && <div className="ship-meter">
          <span className="cart-shipping-label"><IconTruck /><span>
            {!priceReady ? "המשלוח יחושב לפי הסכום לאחר ההנחות" : math.total >= FREE_SHIPPING ? "ההזמנה זכאית למשלוח חינם" : `עוד ${fmt(FREE_SHIPPING - math.total)} למשלוח חינם`}
          </span></span>
          <div className="bar">
            <span style={{ width: (priceReady ? Math.min(100, Math.round((math.total / FREE_SHIPPING) * 100)) : 0) + "%" }} />
          </div>
        </div>}
        <div className="drawer-body">
          {count === 0 && (
            <div className="cart-empty">
              <span className="cart-empty-icon"><IconBag size={38} /></span>
              <h3 className="k">הסל עוד מחכה לך.</h3>
              <p>כל מה שצריך ליום העבודה הבא,<br />במקום אחד.</p>
              <Link href="/quantity-offers" className="btn btn-yellow" onClick={s.closeAll}>למבצעי הכמות <IconFwd /></Link>
              <button type="button" className="cart-edit-link" onClick={s.closeAll}>להמשיך להסתכל</button>
            </div>
          )}
          <CartContents disabled={paying} />
        </div>
        {count > 0 && (
          <div className="drawer-foot">
            {priceReady && math.savings > 0 && (
              <div className="cart-savings-summary">
                <span><IconCheck /> חסכתם במבצעי כמות</span>
                <span dir="ltr">-{fmt(math.savings)}</span>
              </div>
            )}
            <div className="cart-total-summary">
              <span>{s.cartQuote.pending ? "סכום משוער" : "סה״כ"}</span>
              <span aria-live="polite">{s.cartQuote.error ? "—" : fmt(math.total)}</span>
            </div>
            <span className="cart-shipping-note" role="status">{s.cartQuote.pending ? "מאמתים מחירים ומבצעים…" : "עלות המשלוח מחושבת בתשלום"}</span>
            <CheckoutButton onPendingChange={setPaying} />
            <div className="cart-footer-links"><span><IconLock size={14} /> תשלום מאובטח</span><Link href="/checkout" className="cart-edit-link" onClick={s.closeAll}>
              לסיכום ועריכת ההזמנה
            </Link></div>
          </div>
        )}
      </aside>

      <aside className={`drawer menu ${s.menuOpen ? "on" : ""}`} aria-label="תפריט" aria-hidden={!s.menuOpen} inert={!s.menuOpen}>
        <div className="drawer-h menu-header">
          {!s.menuCat ? (
            <img src="/logo.avif" alt="Cohen Brothers" className="menu-logo" />
          ) : (
            <button className="menu-back" onClick={() => s.setMenuCat(null)}>
              <IconBack /> כל הקטגוריות
            </button>
          )}
          <button className="x" onClick={s.closeAll} aria-label="סגירה">
            ×
          </button>
        </div>
        <div className="drawer-body menu-body" key={s.menuCat || "root"}>
          {!s.menuCat ? (
            <>
              <div className="menu-intro">
                <span className="menu-eyebrow">COHEN BROTHERS / ביגוד וציוד לעבודה</span>
                <h2 className="k">מוכנים לעבודה.</h2>
                <span className="menu-intro-mark" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M18 6 6 18M6 7v11h11" /></svg></span>
              </div>
              <nav className="menu-categories" aria-label="קטגוריות מוצרים">
                {categories.map((c) => (
                  <button key={c.id} className="menu-link menu-category" onClick={() => s.setMenuCat(c.id)}>
                    <span className="menu-category-icon"><MenuCategoryIcon name={c.name} /></span>
                    <span className="menu-category-name">{c.name}</span>
                    <span className="menu-arrow"><IconFwd /></span>
                  </button>
                ))}
              </nav>
              <nav className="menu-shortcuts" aria-label="שירותים ואזור אישי">
                <Link href="/quantity-offers" className="menu-shortcut" onClick={s.closeAll}>
                  <IconPackages /><span>מבצעי כמות</span><IconFwd />
                </Link>
                <Link href="/business" className="menu-shortcut" onClick={s.closeAll}>
                  <IconCase /><span>הזמנות לעסקים</span><IconFwd />
                </Link>
                <Link href="/account" className="menu-shortcut" onClick={s.closeAll}>
                  <IconUser /><span>אזור אישי</span><IconFwd />
                </Link>
              </nav>
              <div className="menu-contact">
                <span><IconPin /><span>כאן בשבילכם<span>הפועלים 20, באר שבע</span></span></span>
                <a href="tel:08-6233803" dir="ltr">08-6233803</a>
              </div>
            </>
          ) : (
            <>
              <div className="menu-intro menu-sub-intro">
                <span className="menu-eyebrow">מוצאים בדיוק את מה שצריך</span>
                <h2 className="k">{category(s.menuCat || "")?.name}</h2>
              </div>
              <Link href={`/c/${s.menuCat}`} className="menu-link menu-view-all" onClick={s.closeAll}>
                כל המוצרים
                <IconFwd />
              </Link>
              <nav className="menu-categories" aria-label="תתי קטגוריות">
                {(category(s.menuCat || "")?.subs ?? []).map((name) => (
                  <Link key={name} href={`/c/${s.menuCat}?sub=${encodeURIComponent(name)}`} className="menu-link menu-subcategory" onClick={s.closeAll}>
                    <span>{name}</span><span className="menu-arrow"><IconFwd /></span>
                  </Link>
                ))}
              </nav>
            </>
          )}
        </div>
      </aside>

      <QuickSheet />
      {(s.searchOpen || searchLeaving) && <SearchModal closing={searchLeaving} onExited={() => setSearchPresent(false)} />}
      <div className={`toast ${s.toastOn ? "on" : ""} ${buy ? "buy" : ""} ${!tabs && !buy ? "" : ""}`} style={!tabs && !buy ? { bottom: 24 } : undefined} role="status">
        <i>
          <IconCheck />
        </i>
        {s.toast}
      </div>
    </>
  );
}

function MenuCategoryIcon({ name }: { name: string }) {
  const path = /נעל|redback/i.test(name) ? "M5 3h7v8l3 3 5 2v4H3v-7h2V3ZM5 8h4M5 11h4M3 17h17"
    : /חורף/.test(name) ? "M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 3 3-3M9 20l3-3 3 3M4 10l4-1-1-4M17 19l-1-4 4-1M4 14l4 1-1 4M17 5l-1 4 4 1"
    : /בטיחות/.test(name) ? "M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3ZM8 12l3 3 5-6"
    : /מטבח/.test(name) ? "M9 3h6v5l4 5v8H5v-8l4-5V3ZM8 14h8v4H8v-4"
    : /חד פעמי/.test(name) ? "M3 7l9-4 9 4v11l-9 4-9-4V7ZM3 7l9 4 9-4M12 11v11M8 5l9 4"
    : /אביזר/.test(name) ? "M4 14a8 8 0 0 1 16 0H4ZM12 6v8M4 14l-2 4h20l-2-4"
    : "m8 3-6 4 3 5 3-2v11h8V10l3 2 3-5-6-4a4 4 0 0 1-8 0ZM9 14h6";
  return <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" aria-hidden="true"><path d={path} /></svg>;
}

function QuickSheet() {
  const s = useStore();
  const { product } = useCatalog();
  if (s.sheet !== "quick") return null;
  const p = product(s.quickId);
  if (!p) return null;
  const sizes = productSizeOptions(p, p.colors[s.qColor] || "");
  const selectedLabel = s.qSize === null ? null : sizeLabel(s.qSize) || "מידה אחת";
  const selectedSize = sizes.find((option) => option.label === selectedLabel && option.available);
  const img = categoryProductImage(p, { colors: p.colors[s.qColor] ? [p.colors[s.qColor]] : [], sizes: selectedSize ? [selectedSize.value] : [], stock: false });
  return (
    <section className="sheet quick-sheet" aria-label="הוספה מהירה">
      <div className="sheet-h">
        <span style={{ fontSize: 18, fontWeight: 800 }}>הוספה מהירה</span>
        <button className="x" onClick={s.closeAll} aria-label="סגירה">
          ×
        </button>
      </div>
      <div className="sheet-b">
        <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: 14, alignItems: "center" }}>
          <div className="line-ph">{img && <ProductImage sizes="160px" maxWidth={480} src={img} alt="" />}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
            <ProductBrand name={p.brand} inline />
            <span style={{ fontSize: 16, fontWeight: 700 }}>{p.name}</span>
            <span style={{ fontSize: 17, fontWeight: 800 }}>{fmt(p.price)}</span>
            {p.deal && <span className="badge y">{p.deal[0]} ב-{p.deal[1]} ₪</span>}
          </div>
        </div>
        {p.colors.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span style={{ fontSize: 15 }}>
              <b>צבע: </b>
              {colorLabel(p.colors[s.qColor] ?? "")}
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {p.colors.map((c, i) => (
                <button key={c} className={`color-dot lg ${i === s.qColor ? "on" : "off"}`} style={{ background: swatchColor(c) }} title={colorLabel(c)} aria-label={colorLabel(c)} aria-pressed={i === s.qColor} onClick={() => s.setQColor(i)} />
              ))}
            </div>
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 800 }}>מידה</span>
          <div className="size-grid">
            {sizes.map(({ label, available }) => (
              <button type="button" key={label} disabled={!available} aria-pressed={selectedSize?.label === label} title={!available ? "המידה אינה זמינה בצבע שנבחר" : undefined} className={`size ${selectedSize?.label === label ? "on" : ""}`} onClick={() => s.setQSize(label)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <Link href={`/p/${p.id}`} className="btn btn-line" style={{ height: 56, padding: "0 18px" }} onClick={s.closeAll}>
            לפרטי המוצר
          </Link>
          <button
            type="button"
            className="btn"
            disabled={!selectedSize}
            style={{ flex: 1, height: 56, fontSize: 16, background: selectedSize ? "#111" : "#8a8a86" }}
            onClick={() => {
              if (!selectedSize) return;
              s.addMany([[p.id, s.qColor, selectedSize.value, 1]], false);
            }}
          >
            {selectedSize ? "הוספה לסל" : "בחרו מידה"}
          </button>
        </div>
      </div>
    </section>
  );
}

function SearchModal({ closing, onExited }: { closing: boolean; onExited: () => void }) {
  const s = useStore();
  const { products, category } = useCatalog();
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const input = ref.current;
    if (closing) {
      input?.blur();
      return;
    }
    const t = setTimeout(() => input?.focus({ preventScroll: true }), 30);
    return () => {
      clearTimeout(t);
      input?.blur();
    };
  }, [closing]);
  const q = s.query.trim().toLowerCase();
  const results = q
    ? products.filter((x) =>
        (x.name + " " + (x.sku || "") + " " + (x.brand || "") + " " + (category(x.cat)?.name || "") + " " + (x.sub || "") + " " + (x.std || []).join(" ")).toLowerCase().includes(q)
      )
    : [];
  return (
    <div
      className={`search-modal${closing ? " is-closing" : ""}`}
      role="dialog"
      aria-label="חיפוש"
      aria-hidden={closing || undefined}
      inert={closing || undefined}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget && event.animationName === "searchClose") onExited();
      }}
    >
      <div className="search-mobile-header">
        <img src="/logo.avif" alt="Cohen Brothers" className="menu-logo" />
        <button type="button" className="x" onClick={s.closeAll} aria-label="סגירת החיפוש">×</button>
      </div>
      <div className="search-in">
        <div className="search-intro">
          <span className="menu-eyebrow">ביגוד וציוד לעבודה / חיפוש</span>
          <h2 className="k">מה מחפשים היום?</h2>
          <p>מוצר, מותג או מק״ט — מתחילים כאן.</p>
        </div>
        <div className="search-line">
          <IconSearch size={26} />
          <input ref={ref} value={s.query} onChange={(e) => s.setQuery(e.target.value)} aria-label="מה מחפשים?" placeholder="חיפוש מוצר, מותג או מק״ט" enterKeyHint="search" />
          {s.query && <button type="button" className="search-clear" aria-label="ניקוי החיפוש" onClick={() => { s.setQuery(""); ref.current?.focus({ preventScroll: true }); }}>×</button>}
          <button className="x search-desktop-close" onClick={s.closeAll} aria-label="סגירה">
            ×
          </button>
        </div>
        <div className="search-terms">
          <span className="search-terms-label">חיפושים נפוצים</span>
          {["נעלי עבודה", "S3", "טריקו", "פליז", "כובע"].map((t) => (
            <button key={t} className="term" aria-pressed={q === t.toLowerCase()} onClick={() => s.setQuery(t)}>
              {t}
            </button>
          ))}
        </div>
        {!q && <Link href="/quantity-offers" className="search-offer" onClick={s.closeAll}>
          <span className="search-offer-icon"><IconPackages /></span>
          <span><strong>קונים יותר, משלמים פחות</strong><span>לכל מבצעי הכמות</span></span>
          <IconFwd />
        </Link>}
        {q && (
          <>
            <div className="search-results-heading" role="status"><strong>{results.length} תוצאות</strong>{results.length > 10 && <span>מציגים את 10 הראשונות</span>}</div>
            <div className="search-results">
              {results.slice(0, 10).map((x) => (
                <Link key={x.id} href={`/p/${x.id}`} className="search-hit" onClick={s.closeAll}>
                  <div className="line-ph search-hit-image">
                    {x.imgs?.[0] && <ProductImage sizes="160px" maxWidth={480} src={x.imgs[0]} alt="" />}
                  </div>
                  <div className="search-hit-copy">
                    <ProductBrand name={x.brand} inline />
                    <span className="search-hit-name">{x.name}</span>
                    <span className="search-hit-meta">
                      {category(x.cat)?.name}
                      {x.sku ? " · " + x.sku : ""}
                    </span>
                  </div>
                  <span className="search-hit-price">{fmt(x.price)}</span>
                </Link>
              ))}
              {results.length === 0 && <div className="search-empty"><span className="search-empty-icon"><IconSearch size={28} /></span><strong>לא מצאנו התאמה הפעם</strong><p>נסו שם מוצר אחר, מק״ט או תקן כמו S3.</p></div>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

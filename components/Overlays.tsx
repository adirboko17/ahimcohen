"use client";

import { ProductImage } from "./ProductImage";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { FREE_SHIPPING, phOf, swatchColor, colorLabel } from "@/lib/catalog";
import { useCatalog } from "@/lib/catalog-context";
import { categoryProductImage } from "@/lib/category-filters";
import { fmt } from "@/lib/pricing";
import { productSizeOptions, sizeLabel } from "@/lib/sizes";
import { useStore } from "@/lib/store";
import { IconCheck, IconSearch } from "./icons";
import { CartContents } from "./CartContents";
import { CheckoutButton } from "./CheckoutButton";

export function Overlays() {
  const [paying, setPaying] = useState(false);
  const path = usePathname();
  const s = useStore();
  const { categories, products, category, product } = useCatalog();
  const count = s.cart.reduce((a, l) => a + l.qty, 0);
  const math = s.pricing;
  const priceReady = !!s.cartQuote.quote;
  const dealNotes = priceReady && math.savings > 0 ? [{
    text: `המבצעים הופעלו · חסכתם ${fmt(math.savings)}`,
    pct: "100%", bg: "#FFD100",
  }] : [];
  const open = s.cartOpen || s.menuOpen || s.searchOpen || !!s.sheet;
  const buy = path.startsWith("/p/");
  const tabs = path === "/" || path.startsWith("/c/") || path.startsWith("/business") || path.startsWith("/account");

  return (
    <>
      <div className={`backdrop ${open ? "on" : ""}`} onClick={s.closeAll} />
      <aside className={`drawer cart ${s.cartOpen ? "on" : ""}`} aria-label="סל הקניות">
        <div className="drawer-h">
          <span style={{ fontSize: 19, fontWeight: 800 }}>
            הסל שלך <span style={{ fontWeight: 500, color: "#5e5e5b" }}>({count})</span>
          </span>
          <button className="x" onClick={s.closeAll} aria-label="סגירה">
            ×
          </button>
        </div>
        <div className="ship-meter">
          <span style={{ fontSize: 14, fontWeight: 700 }}>
            {!priceReady ? "המשלוח יחושב לפי הסכום לאחר ההנחות" : math.total >= FREE_SHIPPING ? "ההזמנה זכאית למשלוח חינם" : `עוד ${fmt(FREE_SHIPPING - math.total)} למשלוח חינם`}
          </span>
          <div className="bar">
            <span style={{ width: (priceReady ? Math.min(100, Math.round((math.total / FREE_SHIPPING) * 100)) : 0) + "%" }} />
          </div>
        </div>
        <div className="drawer-body">
          {count === 0 && (
            <div style={{ padding: "64px 8px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
              <span className="k" style={{ fontSize: 64, lineHeight: 0.85 }}>
                הסל ריק
              </span>
              <span className="muted" style={{ fontSize: 15 }}>
                שווה להתחיל ממבצעי הכמות — 6 חולצות דרייפיט ב-100 ₪.
              </span>
              {categories[0] && (
                <Link href={`/c/${categories[0].id}`} className="btn" style={{ marginTop: 8, height: 50, padding: "0 24px" }} onClick={s.closeAll}>
                  להתחיל לקנות
                </Link>
              )}
            </div>
          )}
          <CartContents disabled={paying} />
          {dealNotes.map((dn) => (
            <div key={dn.text} style={{ marginTop: 10, background: dn.bg, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.4 }}>{dn.text}</span>
              <div className="bar" style={{ background: "rgba(0,0,0,.12)" }}>
                <span style={{ width: dn.pct }} />
              </div>
            </div>
          ))}
        </div>
        {count > 0 && (
          <div className="drawer-foot">
            {priceReady && math.savings > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 800 }}>
                <span style={{ background: "#FFD100", padding: "0 6px" }}>חסכתם במבצעי כמות</span>
                <span dir="ltr">-{fmt(math.savings)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 19, fontWeight: 800 }}>
              <span>סה״כ</span>
              <span aria-live="polite">{s.cartQuote.pending ? "מחשב מחיר…" : s.cartQuote.error ? "—" : fmt(math.total)}</span>
            </div>
            <CheckoutButton onPendingChange={setPaying} />
            <Link href="/checkout" className="cart-edit-link" onClick={s.closeAll}>
              לסיכום ועריכת ההזמנה
            </Link>
          </div>
        )}
      </aside>

      <aside className={`drawer menu ${s.menuOpen ? "on" : ""}`} aria-label="תפריט">
        <div className="drawer-h" style={{ height: 60, padding: "0 8px 0 16px" }}>
          {!s.menuCat ? (
            <img src="/logo.avif" alt="Cohen Brothers" style={{ height: 22 }} />
          ) : (
            <button onClick={() => s.setMenuCat(null)} style={{ background: "none", border: 0, fontSize: 16, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
              → חזרה
            </button>
          )}
          <button className="x" onClick={s.closeAll} aria-label="סגירה">
            ×
          </button>
        </div>
        <div className="drawer-body" style={{ padding: "12px 20px 24px" }}>
          {!s.menuCat ? (
            <>
              {categories.map((c) => (
                <button key={c.id} className="menu-link" onClick={() => s.setMenuCat(c.id)}>
                  {c.name}
                  <span className="faint">←</span>
                </button>
              ))}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 22 }}>
                <Link href="/business" className="btn" style={{ height: 54, fontSize: 15, fontWeight: 700 }} onClick={s.closeAll}>
                  הזמנות לעסקים
                </Link>
                  <Link href="/quantity-offers" className="btn btn-yellow" style={{ height: 54, fontSize: 15 }} onClick={s.closeAll}>
                    מבצעי כמות
                  </Link>
              </div>
              <div style={{ marginTop: 26, fontSize: 15, lineHeight: 1.8 }} className="muted">
                הפועלים 20, באר שבע
                <br />
                <a href="tel:08-6233803" style={{ fontWeight: 700, color: "#111" }}>
                  08-6233803
                </a>
              </div>
            </>
          ) : (
            <>
              <span className="k" style={{ display: "block", fontSize: 60, lineHeight: 0.85, margin: "6px 0 14px" }}>
                {category(s.menuCat || "")?.name}
              </span>
              <Link href={`/c/${s.menuCat}`} className="menu-link" style={{ fontWeight: 800, fontSize: 17, height: 56 }} onClick={s.closeAll}>
                כל המוצרים
                <span>←</span>
              </Link>
              {(category(s.menuCat || "")?.subs ?? []).map((name) => (
                <Link key={name} href={`/c/${s.menuCat}?sub=${encodeURIComponent(name)}`} className="menu-link" style={{ fontWeight: 500, fontSize: 17, height: 54 }} onClick={s.closeAll}>
                  {name}
                </Link>
              ))}
            </>
          )}
        </div>
      </aside>

      <QuickSheet />
      {s.searchOpen && <SearchModal />}
      <div className={`toast ${s.toastOn ? "on" : ""} ${buy ? "buy" : ""} ${!tabs && !buy ? "" : ""}`} style={!tabs && !buy ? { bottom: 24 } : undefined} role="status">
        <i>
          <IconCheck />
        </i>
        {s.toast}
      </div>
    </>
  );
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

function SearchModal() {
  const s = useStore();
  const { products, category } = useCatalog();
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = setTimeout(() => ref.current?.focus(), 30);
    return () => clearTimeout(t);
  }, []);
  const q = s.query.trim().toLowerCase();
  const results = q
    ? products.filter((x) =>
        (x.name + " " + (x.sku || "") + " " + (x.brand || "") + " " + (category(x.cat)?.name || "") + " " + (x.sub || "") + " " + (x.std || []).join(" ")).toLowerCase().includes(q)
      )
    : [];
  return (
    <div className="search-modal" role="dialog" aria-label="חיפוש">
      <div className="search-in">
        <div className="search-line">
          <IconSearch size={26} />
          <input ref={ref} value={s.query} onChange={(e) => s.setQuery(e.target.value)} placeholder="מה מחפשים?" enterKeyHint="search" />
          <button className="x" onClick={s.closeAll} aria-label="סגירה">
            ×
          </button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 18, alignItems: "center" }}>
          <span style={{ fontSize: 14, fontWeight: 700, marginInlineEnd: 6 }}>חיפושים נפוצים</span>
          {["נעלי עבודה", "S3", "טריקו", "פליז", "כובע"].map((t) => (
            <button key={t} className="term" onClick={() => s.setQuery(t)}>
              {t}
            </button>
          ))}
        </div>
        {q && (
          <>
            <div style={{ marginTop: 28, fontSize: 14, fontWeight: 700 }}>{results.length} תוצאות</div>
            <div style={{ display: "flex", flexDirection: "column", marginTop: 8 }}>
              {results.slice(0, 10).map((x) => (
                <Link key={x.id} href={`/p/${x.id}`} className="search-hit" onClick={s.closeAll}>
                  <div className="line-ph" style={{ width: 64, height: 70 }}>
                    {x.imgs?.[0] && <ProductImage sizes="160px" maxWidth={480} src={x.imgs[0]} alt="" />}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                    <span style={{ fontSize: 16, fontWeight: 700 }}>{x.name}</span>
                    <span className="muted" style={{ fontSize: 13 }}>
                      {category(x.cat)?.name}
                      {x.sku ? " · " + x.sku : ""}
                    </span>
                  </div>
                  <span style={{ fontSize: 16, fontWeight: 800 }}>{fmt(x.price)}</span>
                </Link>
              ))}
              {results.length === 0 && <div style={{ padding: "40px 0", fontSize: 16 }} className="muted">לא נמצאו תוצאות. נסו שם מוצר, מק״ט או תקן (למשל S3).</div>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

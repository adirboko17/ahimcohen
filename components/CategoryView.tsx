"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { swatchColor, colorLabel, type Product } from "@/lib/catalog";
import { useCatalog } from "@/lib/catalog-context";
import { CATEGORY_PAGE_SIZE as PAGE_SIZE, useCategoryHistory, type CategoryFilters as Filters } from "@/lib/category-history";
import { fmt } from "@/lib/pricing";
import { useScrollLock } from "@/lib/store";
import { IconFilter } from "./icons";
import { ProductTile } from "./ProductTile";

export function CategoryView({ catId }: { catId: string }) {
  const searchParams = useSearchParams();
  const sub = searchParams.get("sub") || null;
  return <CategoryResults key={JSON.stringify([catId, sub])} catId={catId} sub={sub} />;
}

function CategoryResults({ catId, sub }: { catId: string; sub: string | null }) {
  const { category, productsInCategory, categories } = useCatalog();
  const cat = category(catId);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { filters: f, setFilters: setF, sort, setSort, shown, setShown, clearFilters, restoring, rememberBeforeNavigation } = useCategoryHistory(catId, sub);
  const [sheet, setSheet] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  useScrollLock(sheet);

  const base = useMemo(() => productsInCategory(catId), [catId, productsInCategory]);
  const prices = base.map((p) => p.price);
  const pMin = prices.length ? Math.min(...prices) : 0;
  const pTop = prices.length ? Math.max(...prices) : 100;
  const pMax = f.max ?? pTop;

  const uniq = (fn: (p: Product) => string[]) => [...new Set(base.flatMap(fn))];
  const stdOpts = uniq((p) => p.std || []);
  const sizeOpts = uniq((p) => p.sizes).filter((z) => z !== "מידה אחת");
  const colorOpts = uniq((p) => p.colors);
  const brandOpts = uniq((p) => (p.brand ? [p.brand] : []));

  let list = base.filter((p) => !sub || p.sub === sub || (p.subs ?? []).includes(sub));
  list = list.filter(
    (p) =>
      (!f.std.length || f.std.every((t) => (p.std || []).includes(t))) &&
      (!f.colors.length || p.colors.some((c) => f.colors.includes(c))) &&
      (!f.sizes.length || p.sizes.some((z) => f.sizes.includes(z))) &&
      (!f.brands.length || (!!p.brand && f.brands.includes(p.brand))) &&
      p.price <= pMax
  );
  if (sort === "asc") list = list.slice().sort((a, b) => a.price - b.price);
  if (sort === "desc") list = list.slice().sort((a, b) => b.price - a.price);

  const total = list.length;
  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel || shown >= total || sheet || restoring) return;

    // Products are already in the catalog; reveal the next batch just before
    // the visitor reaches the end, without another Shopify request.
    if (!("IntersectionObserver" in window)) {
      setShown(total);
      return;
    }

    let active = true;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!active || !entries.some((entry) => entry.isIntersecting)) return;
        active = false;
        observer.disconnect();
        setShown((count) => Math.min(count + PAGE_SIZE, total));
      },
      { rootMargin: "0px 0px 500px 0px" },
    );
    observer.observe(sentinel);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [shown, total, catId, sub, f, sort, sheet, restoring, setShown]);

  const fCount = f.std.length + f.colors.length + f.sizes.length + f.brands.length + (f.max != null && f.max < pTop ? 1 : 0);
  const toggle = (field: "std" | "colors" | "sizes" | "brands", val: string) => {
    setF((s) => {
      const a = s[field];
      const n = a.includes(val) ? a.filter((x) => x !== val) : a.concat(val);
      return { ...s, [field]: n };
    });
  };
  const clear = () => {
    if (!base.length && categories[0]) {
      router.push(`/c/${categories[0].id}`);
      return;
    }
    clearFilters();
    pickSub(null);
  };
  const pickSub = (name: string | null) => {
    // Filtering uses the catalog already in memory. Next synchronizes native
    // history changes with useSearchParams without another server render.
    const params = new URLSearchParams(searchParams.toString());
    if (name) params.set("sub", name);
    else params.delete("sub");
    const query = params.toString();
    window.history.replaceState(null, "", `/c/${catId}${query ? `?${query}` : ""}`);
  };

  const active = (["std", "sizes", "colors", "brands"] as const).flatMap((field) => f[field].map((v) => ({ v, field })));

  if (!cat) return null;

  return (
    <main className="wrap" style={{ paddingTop: "clamp(18px, 3vw, 36px)" }} onClickCapture={rememberBeforeNavigation}>
      <div className="crumbs">
        <Link href="/">בית</Link>
        <span>/</span>
        <span className="now">{sub || cat.name}</span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", paddingBottom: 20 }}>
        <h1 className="k page-title">{sub || cat.name}</h1>
        <span className="muted" style={{ fontSize: 15, fontWeight: 600 }}>
          {list.length} מוצרים
        </span>
      </div>
      <div className="sub-row scroller">
        <button className={`chip ${!sub ? "on" : "off"}`} onClick={() => pickSub(null)}>
          הכל
        </button>
        {cat.subs.map((name) => (
          <button key={name} className={`chip ${sub === name ? "on" : "off"}`} onClick={() => pickSub(name)}>
            {name}
          </button>
        ))}
      </div>

      <div className="filter-bar mob-grid">
        <button className="btn" style={{ height: 48, fontSize: 15, gap: 8 }} onClick={() => setSheet(true)}>
          <IconFilter />
          סינון{fCount ? ` (${fCount})` : ""}
        </button>
        <select className="plain" style={{ height: 48, textAlign: "center" }} value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="pop">מיון: פופולריים</option>
          <option value="asc">מחיר: נמוך לגבוה</option>
          <option value="desc">מחיר: גבוה לנמוך</option>
        </select>
      </div>

      <div className="cat-layout">
        <aside className="filters desk">
          <FilterBody
            stdOpts={stdOpts}
            sizeOpts={sizeOpts}
            colorOpts={colorOpts}
            brandOpts={brandOpts}
            f={f}
            toggle={toggle}
            pMin={pMin}
            pTop={pTop}
            pMax={pMax}
            setMax={(v) => setF((s) => ({ ...s, max: v }))}
            clear={clear}
            hasFilters={fCount > 0}
            stock={f.stock}
            setStock={() => setF((s) => ({ ...s, stock: !s.stock }))}
          />
        </aside>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="sort-row desk">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {active.map((a) => (
                <button key={a.field + a.v} className="active-chip" onClick={() => toggle(a.field, a.v)}>
                  {a.v}
                  <span>×</span>
                </button>
              ))}
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 600 }}>
              מיון
              <select className="plain" value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="pop">פופולריים</option>
                <option value="asc">מחיר: נמוך לגבוה</option>
                <option value="desc">מחיר: גבוה לנמוך</option>
              </select>
            </label>
          </div>
          {list.length > 0 ? (
            <div className="product-grid">
              {list.slice(0, shown).map((p) => (
                <ProductTile key={p.id} p={p} />
              ))}
            </div>
          ) : (
            <div className="empty">
              <span className="k" style={{ fontSize: 64, lineHeight: 0.85 }}>
                {base.length ? "אין התאמות" : "בקרוב"}
              </span>
              <span className="muted" style={{ fontSize: 16, maxWidth: "42ch" }}>
                {base.length ? "נסו להסיר חלק מהמסננים או לבחור תת-קטגוריה אחרת." : "המוצרים בקטגוריה זו יוצגו לאחר חיבור הקטלוג המלא."}
              </span>
              <button className="btn" style={{ marginTop: 8, height: 50, padding: "0 24px" }} onClick={clear}>
                {base.length ? "ניקוי המסננים" : "לביגוד מקצועי"}
              </button>
            </div>
          )}
          {list.length > 0 && (
            <div className="load-more" ref={loadMoreRef}>
              <span role="status" aria-live="polite" aria-atomic="true" style={{ fontSize: 14, fontWeight: 600 }}>
                מוצגים {Math.min(shown, list.length)} מתוך {list.length}
              </span>
              <div className="meter" aria-hidden="true">
                <span style={{ width: Math.round((Math.min(shown, list.length) / list.length) * 100) + "%" }} />
              </div>
            </div>
          )}
        </div>
      </div>

      {sheet && (
        <>
          <div className="backdrop on" onClick={() => setSheet(false)} />
          <section className="sheet" aria-label="סינון">
            <div className="sheet-h">
              <span style={{ fontSize: 18, fontWeight: 800 }}>סינון</span>
              <button className="x" onClick={() => setSheet(false)} aria-label="סגירה">
                ×
              </button>
            </div>
            <div className="sheet-b">
              <FilterBody
                stdOpts={stdOpts}
                sizeOpts={sizeOpts}
                colorOpts={colorOpts}
                brandOpts={brandOpts}
                f={f}
                toggle={toggle}
                pMin={pMin}
                pTop={pTop}
                pMax={pMax}
                setMax={(v) => setF((s) => ({ ...s, max: v }))}
                clear={clear}
                hasFilters={fCount > 0}
                stock={f.stock}
                setStock={() => setF((s) => ({ ...s, stock: !s.stock }))}
                bare
              />
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn btn-line" style={{ height: 56, padding: "0 22px" }} onClick={clear}>
                  ניקוי
                </button>
                <button className="btn" style={{ flex: 1, height: 56, fontSize: 16 }} onClick={() => setSheet(false)}>
                  הצגת {list.length} מוצרים
                </button>
              </div>
            </div>
          </section>
        </>
      )}
    </main>
  );
}

function FilterBody(props: {
  stdOpts: string[];
  sizeOpts: string[];
  colorOpts: string[];
  brandOpts: string[];
  f: Filters;
  toggle: (field: "std" | "colors" | "sizes" | "brands", val: string) => void;
  pMin: number;
  pTop: number;
  pMax: number;
  setMax: (v: number) => void;
  clear: () => void;
  hasFilters: boolean;
  stock: boolean;
  setStock: () => void;
  bare?: boolean;
}) {
  return (
    <>
      {!props.bare && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 16 }}>
          <span style={{ fontSize: 18, fontWeight: 800 }}>סינון</span>
          {props.hasFilters && (
            <button onClick={props.clear} style={{ background: "none", border: 0, fontSize: 14, fontWeight: 600, textDecoration: "underline" }}>
              ניקוי
            </button>
          )}
        </div>
      )}
      {props.stdOpts.length > 0 && (
        <div className="filter-block" style={props.bare ? { borderTop: 0, paddingTop: 0 } : undefined}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>תקן בטיחות</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {props.stdOpts.map((v) => (
              <button key={v} className={`mini ${props.f.std.includes(v) ? "on" : ""}`} onClick={() => props.toggle("std", v)}>
                {v}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="filter-block">
        <span style={{ fontSize: 15, fontWeight: 700 }}>מידה</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {props.sizeOpts.map((v) => (
            <button key={v} className={`mini ${props.f.sizes.includes(v) ? "on" : ""}`} style={{ direction: "ltr" }} onClick={() => props.toggle("sizes", v)}>
              {v}
            </button>
          ))}
        </div>
      </div>
      <div className="filter-block">
        <span style={{ fontSize: 15, fontWeight: 700 }}>צבע</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 9 }}>
          {props.colorOpts.map((c) => (
            <button key={c} title={colorLabel(c)} aria-label={colorLabel(c)} aria-pressed={props.f.colors.includes(c)} className={`color-dot ${props.f.colors.includes(c) ? "on" : "off"}`} style={{ background: swatchColor(c) }} onClick={() => props.toggle("colors", c)} />
          ))}
        </div>
      </div>
      <div className="filter-block">
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>מחיר עד</span>
          <span style={{ fontSize: 15, fontWeight: 700 }}>{fmt(props.pMax)}</span>
        </div>
        <input type="range" min={props.pMin} max={props.pTop} value={props.pMax} onChange={(e) => props.setMax(+e.target.value)} style={{ width: "100%", accentColor: "#111" }} />
      </div>
      {props.brandOpts.length > 0 && (
        <div className="filter-block">
          <span style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>מותג</span>
          {props.brandOpts.map((b) => (
            <button key={b} className="checkline" onClick={() => props.toggle("brands", b)}>
              <span className={`box ${props.f.brands.includes(b) ? "on" : ""}`} />
              {b}
            </button>
          ))}
        </div>
      )}
      <button onClick={props.setStock} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "none", border: 0, borderTop: "1px solid #E4E4E1", padding: "18px 0", fontSize: 15, fontWeight: 700 }}>
        במלאי בלבד
        <span className={`toggle ${props.stock ? "on" : ""}`}>
          <i style={{ right: props.stock ? 21 : 3 }} />
        </span>
      </button>
    </>
  );
}

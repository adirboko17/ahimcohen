"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useId, useMemo, useState, type ReactNode } from "react";
import { productSubcategories, type Category, type Product } from "@/lib/catalog";
import { canonicalBrandName, uniqueBrandNames, type Brand } from "@/lib/brands";
import { useCatalog } from "@/lib/catalog-context";
import { categoryProductSelection, categoryVariantFilters } from "@/lib/category-filters";
import { categoryBatchLimit } from "@/lib/category-sorting";
import { categoryColorLabel, categoryColorMatcher, categoryColorOptions, categoryColorValue, colorFamilyFilter, emptyColorMappings } from "@/lib/color-families";
import { matchesSizeFilter, uniqueSizes } from "@/lib/sizes";
import { useCategoryHistory, type CategoryFilters as Filters } from "@/lib/category-history";
import { fmt } from "@/lib/pricing";
import { useScrollLock } from "@/lib/store";
import { IconFilter, IconPencil } from "./icons";
import { CategoryScroller } from "./CategoryScroller";
import { ProductListProgress } from "./ProductListProgress";
import { ProductTile } from "./ProductTile";
import { MobileFilterSheet } from "./MobileFilterSheet";
import { CategorySortDialog, SortProductCard, useCategorySorting } from "./CategorySorting";

type ListingScope = { catId: string; categoryFallback?: Category; brand?: never } | { brand: Brand; catId?: never; categoryFallback?: never };

export function CategoryView(scope: ListingScope) {
  const searchParams = useSearchParams();
  const sub = searchParams.get("sub") || null;
  const sorting = useCategorySorting(Boolean(scope.catId));
  return <CategoryResults key={JSON.stringify([scope.brand ? `brand:${scope.brand.id}` : scope.catId, sub])} {...scope} sub={sub} sorting={sorting} />;
}

function CategoryResults({ catId, categoryFallback, brand, sub, sorting }: ListingScope & { sub: string | null; sorting: ReturnType<typeof useCategorySorting> }) {
  const { category, products, productsInCategory, categories, colorMappings = emptyColorMappings } = useCatalog();
  const scopeId = brand ? `brand:${brand.id}` : catId;
  const routePath = brand ? `/brands/${brand.id}` : `/c/${catId}`;
  const router = useRouter();
  const searchParams = useSearchParams();
  const { filters: savedFilters, setFilters: setF, sort, setSort, shown, setShown, clearFilters, restoring, rememberBeforeNavigation } = useCategoryHistory(scopeId, sub, routePath);
  const [sheet, setSheet] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [sortDialog, setSortDialog] = useState(false);
  useScrollLock(sheet || sortDialog);

  const categoryProducts = useMemo(() => brand
    ? products.filter(product => canonicalBrandName(product.brand)?.toLowerCase() === brand.name.toLowerCase())
    : productsInCategory(catId), [brand, products, catId, productsInCategory]);
  const catalogCategory = catId ? category(catId) : undefined;
  const cat = useMemo(() => brand ? {
    name: brand.name,
    subs: [...new Set(categoryProducts.flatMap(product => [product.sub, ...(product.subs ?? [])]).filter(Boolean))],
  } : catalogCategory ?? categoryFallback, [brand, categoryProducts, catalogCategory, categoryFallback]);
  const base = useMemo(() => categoryProducts.filter(p => !sub || (catId
    ? productSubcategories(p, catId).includes(sub)
    : p.sub === sub || (p.subs ?? []).includes(sub))), [categoryProducts, catId, sub]);
  const f = useMemo(() => ({
    ...savedFilters,
    colors: [...new Set(savedFilters.colors.map(color => categoryColorValue(color, colorMappings)))].filter(color => {
      const matches = categoryColorMatcher([color], colorMappings);
      return base.some(product => matches(product.colors));
    }),
    sizes: uniqueSizes(savedFilters.sizes).filter((size) => base.some((p) => matchesSizeFilter(p.sizes, [size]))),
    std: savedFilters.std.filter((standard) => base.some((p) => p.std?.includes(standard))),
    brands: brand ? [] : uniqueBrandNames(savedFilters.brands).filter((name) => base.some((p) => canonicalBrandName(p.brand) === name)),
  }), [savedFilters, base, brand, colorMappings]);
  const prices = base.map((p) => p.price);
  const pMin = prices.length ? Math.min(...prices) : 0;
  const pTop = prices.length ? Math.max(...prices) : 100;
  const pMax = f.max ?? pTop;

  const uniq = (fn: (p: Product) => string[]) => [...new Set(base.flatMap(fn))];
  const stdOpts = uniq((p) => p.std || []);
  const brandOpts = brand ? [] : uniqueBrandNames(base.flatMap((p) => p.brand ? [p.brand] : []));

  const eligible = base.filter(
    (p) =>
      (!f.std.length || f.std.every((t) => (p.std || []).includes(t))) &&
      (!f.brands.length || f.brands.includes(canonicalBrandName(p.brand) ?? "")) &&
      p.price <= pMax
  );
  const variants = categoryVariantFilters(eligible, f, colorMappings);
  // Keep selected choices removable even if another filter rules them out.
  const sizeOpts = uniqueSizes([...variants.sizes, ...f.sizes]);
  const colorOpts = categoryColorOptions([...variants.colors, ...f.colors], colorMappings);
  let list = variants.products;
  if (sort === "asc") list = list.slice().sort((a, b) => a.price - b.price);
  if (sort === "desc") list = list.slice().sort((a, b) => b.price - a.price);

  const fCount = f.std.length + f.colors.length + f.sizes.length + f.brands.length + (f.max != null && f.max < pTop ? 1 : 0);
  const toggle = (field: "std" | "colors" | "sizes" | "brands", val: string) => {
    setF((s) => {
      const a = field === "colors" ? [...new Set(s.colors.map(color => categoryColorValue(color, colorMappings)))]
        : field === "sizes" ? uniqueSizes(s.sizes) : field === "brands" ? uniqueBrandNames(s.brands) : s[field];
      const n = a.includes(val) ? a.filter((x) => x !== val) : a.concat(val);
      return { ...s, [field]: n };
    });
  };
  const clear = () => {
    if (brand && !categoryProducts.length) {
      router.push("/brands");
      return;
    }
    if (!categoryProducts.length && categories[0]) {
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
    window.history.replaceState(null, "", `${routePath}${query ? `?${query}` : ""}`);
  };

  const active = (["std", "sizes", "colors", "brands"] as const).flatMap((field) => f[field].map((v) => ({ v, field })));

  if (!cat) return null;
  const visible = list.slice(0, shown);
  const editOptions = catId && sorting.access.enabled ? sorting.access : null;
  const sortingHere = Boolean(editOptions && sorting.editing);
  const displayedSubs = brand ? cat.subs : sub ? [] : catalogCategory?.subs ?? [];
  const selected = new Set(picked);
  const canUndo = editOptions?.lastEdit;
  const showSortBar = sortingHere && (picked.length > 0 || sorting.notice || canUndo);

  return (
    <main className="wrap" data-category-sorting={showSortBar ? true : undefined} style={{ paddingTop: "clamp(18px, 3vw, 36px)" }} onClickCapture={rememberBeforeNavigation}>
      <div className="crumbs">
        <Link href="/">בית</Link>
        <span>/</span>
        {brand && <><Link href="/brands">המותגים שלנו</Link><span>/</span>{sub && <><Link href={routePath}>{brand.name}</Link><span>/</span></>}</>}
        {catId && sub && <><Link href={routePath}>{cat.name}</Link><span>/</span></>}
        <span className="now">{sub || cat.name}</span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap", paddingBottom: 20 }}>
        <h1 className="k page-title" dir={brand ? "auto" : undefined}>{brand ? brand.name : sub || cat.name}</h1>
        <div className="category-sort-heading">
          <span className="muted" style={{ fontSize: 15, fontWeight: 600 }}>{list.length} מוצרים</span>
          {editOptions && <button type="button" className="btn btn-line category-sort-toggle" aria-pressed={sortingHere} disabled={sorting.busy}
            onClick={() => {
              setPicked([]);
              sorting.clearNotice();
              sorting.setEditing(!sortingHere);
            }}>
            <IconPencil />{sortingHere ? "סיום סידור" : "סידור מוצרים"}
          </button>}
        </div>
      </div>
      {(brand || displayedSubs.length > 0) && <CategoryScroller selected={sub} label="תתי קטגוריות">
        {brand && <button className={`chip ${!sub ? "on" : "off"}`} disabled={sorting.busy} onClick={() => pickSub(null)}>
          הכל
        </button>}
        {displayedSubs.map((name) => (
          <button key={name} className={`chip ${sub === name ? "on" : "off"}`} disabled={sorting.busy} onClick={() => pickSub(name)}>
            {name}
          </button>
        ))}
      </CategoryScroller>}

      <div className="filter-bar mob-grid">
        <button className="btn" aria-haspopup="dialog" aria-expanded={sheet} style={{ height: 48, fontSize: 15, gap: 8 }} onClick={() => setSheet(true)}>
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
        <aside className="filters desk" aria-label="סינון מוצרים" tabIndex={0}>
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
                  {a.field === "colors" ? categoryColorLabel(a.v) : a.v}
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
              {visible.map((p, index) => {
                const selection = categoryProductSelection(p, f, colorMappings);
                const tile = <ProductTile key={p.id} p={p} priority={index < 2} imageSrc={selection.image} selectedColor={selection.color} selectedSize={selection.size} />;
                if (!sortingHere) return tile;
                return <SortProductCard key={p.id} name={p.name} checked={selected.has(p.id)}
                  disabled={sorting.busy || (!selected.has(p.id) && picked.length >= categoryBatchLimit)} onChange={() => {
                    sorting.clearNotice();
                    setPicked(current => current.includes(p.id) ? current.filter(id => id !== p.id) : [...current, p.id]);
                  }}>{tile}</SortProductCard>;
              })}
            </div>
          ) : (
            <div className="empty">
              <span className="k" style={{ fontSize: 64, lineHeight: 0.85 }}>
                {sortingHere && !base.length ? "אין מוצרים לשיוך הזה" : categoryProducts.length ? "אין התאמות" : "בקרוב"}
              </span>
              {(!sortingHere || base.length > 0) && <><span className="muted" style={{ fontSize: 16, maxWidth: "42ch" }}>
                {categoryProducts.length ? "נסו להסיר חלק מהמסננים או לבחור תת-קטגוריה אחרת." : brand ? "כרגע אין מוצרים להצגה במותג הזה." : "המוצרים בקטגוריה זו יוצגו לאחר חיבור הקטלוג המלא."}
              </span>
              <button className="btn" style={{ marginTop: 8, height: 50, padding: "0 24px" }} onClick={clear}>
                {categoryProducts.length ? "ניקוי המסננים" : brand ? "לכל המותגים" : "לביגוד מקצועי"}
              </button></>}
            </div>
          )}
          <ProductListProgress shown={shown} total={list.length} paused={sheet || restoring} setShown={setShown} />
        </div>
      </div>

      {showSortBar && <div className="category-sort-bar" aria-label="סידור מוצרים">
        <div className="category-sort-bar-copy">
          {picked.length > 0 && <strong aria-live="polite">{picked.length === 1 ? "מוצר אחד נבחר" : `${picked.length} מוצרים נבחרו`}</strong>}
          {picked.length === categoryBatchLimit && <span>אפשר להעביר עד {categoryBatchLimit} מוצרים בפעולה אחת.</span>}
          {!sortDialog && sorting.notice && <span role={sorting.notice.error ? "alert" : "status"} data-error={sorting.notice.error}>{sorting.notice.text}</span>}
        </div>
        {picked.length > 0 ? <>
          <button type="button" className="btn btn-line" disabled={sorting.busy} onClick={() => setPicked([])}>ניקוי בחירה</button>
          <button type="button" className="btn" disabled={sorting.busy} onClick={() => { sorting.clearNotice(); setSortDialog(true); }}>העבר ל…</button>
        </> : canUndo && <button type="button" className="btn btn-line" disabled={sorting.busy}
          onClick={() => sorting.submit({ operation: "undo", id: canUndo.id })}>
          {canUndo.mode === "move" ? "בטל העברה אחרונה" : "בטל הוספה אחרונה"}
        </button>}
      </div>}

      {sortDialog && editOptions && catId && <CategorySortDialog
        source={{ parentId: catId, sub: sub ?? "" }} categories={editOptions.categories} products={picked} saving={sorting.busy} notice={sorting.notice}
        onClose={() => { sorting.clearNotice(); setSortDialog(false); }}
        onSubmit={command => sorting.submit(command, () => { setPicked([]); setSortDialog(false); })} />}

      {sheet && (
        <MobileFilterSheet onClose={() => setSheet(false)} footer={(close) => <>
          <button className="btn btn-line" style={{ height: 52, padding: "0 22px" }} onClick={clear}>ניקוי</button>
          <button className="btn" style={{ flex: 1, height: 52, fontSize: 16 }} onClick={close}>הצגת {list.length} מוצרים</button>
        </>}>
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
        </MobileFilterSheet>
      )}
    </main>
  );
}

function FilterBody(props: {
  stdOpts: string[];
  sizeOpts: string[];
  colorOpts: ReturnType<typeof categoryColorOptions>;
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
          <FilterOptions options={props.stdOpts} selected={props.f.std} limit={6} label="תקנים" renderOption={(v) => (
              <button type="button" key={v} aria-pressed={props.f.std.includes(v)} className={`mini ${props.f.std.includes(v) ? "on" : ""}`} onClick={() => props.toggle("std", v)}>
                {v}
              </button>
          )} />
        </div>
      )}
      <div className="filter-block">
        <span style={{ fontSize: 15, fontWeight: 700 }}>מידה</span>
        <FilterOptions options={props.sizeOpts} selected={props.f.sizes} limit={8} label="מידות" renderOption={(v) => (
            <button type="button" key={v} aria-pressed={props.f.sizes.includes(v)} className={`mini ${props.f.sizes.includes(v) ? "on" : ""}`} style={{ direction: "ltr" }} onClick={() => props.toggle("sizes", v)}>
              {v}
            </button>
        )} />
      </div>
      {(props.colorOpts.families.length > 0 || props.colorOpts.additional.length > 0) && <div className="filter-block">
        <span style={{ fontSize: 15, fontWeight: 700 }}>צבע</span>
        {props.colorOpts.families.length > 0 && <div className="filter-options" role="group" aria-label="משפחות צבע">
          {props.colorOpts.families.map(({ value, label, swatch }) => <button type="button" key={value}
            aria-label={label} aria-pressed={props.f.colors.includes(value)} className={`mini filter-color-family ${props.f.colors.includes(value) ? "on" : "off"}`}
            onClick={() => props.toggle("colors", value)}><span aria-hidden="true" style={{ background: swatch }} />{label}</button>)}
        </div>}
        {props.colorOpts.additional.length > 0 && <details className="filter-colors-additional"
          open={props.f.colors.some(color => !colorFamilyFilter(color)) || undefined}>
          <summary>צבעים נוספים</summary>
          <FilterOptions options={props.colorOpts.additional} selected={props.f.colors} limit={10} label="צבעים" renderOption={color => (
            <button type="button" key={color} aria-pressed={props.f.colors.includes(color)} className={`mini filter-color-label ${props.f.colors.includes(color) ? "on" : "off"}`}
              onClick={() => props.toggle("colors", color)}><bdi>{color}</bdi></button>
          )} />
        </details>}
      </div>}
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
          <FilterOptions options={props.brandOpts} selected={props.f.brands} limit={5} label="מותגים" variant="list" renderOption={(b) => (
            <button type="button" key={b} aria-pressed={props.f.brands.includes(b)} className="checkline" onClick={() => props.toggle("brands", b)}>
              <span className={`box ${props.f.brands.includes(b) ? "on" : ""}`} />
              {b}
            </button>
          )} />
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

function FilterOptions({ options, selected, limit, label, variant = "chips", renderOption }: {
  options: string[];
  selected: string[];
  limit: number;
  label: string;
  variant?: "chips" | "list";
  renderOption: (value: string) => ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const optionsId = useId();
  // Keep active choices visible after collapsing or returning from a product.
  const compactOptions = options.filter((value, index) => index < limit || selected.includes(value));
  const hiddenCount = options.length - compactOptions.length;
  const visible = expanded ? options : compactOptions;

  return (
    <>
      <div id={optionsId} className={`filter-options filter-options-${variant}`}>
        {visible.map(renderOption)}
      </div>
      {hiddenCount > 0 && (
        <button
          type="button"
          className="filter-expand"
          aria-expanded={expanded}
          aria-controls={optionsId}
          aria-label={expanded ? `הצג פחות ${label}` : `הצג עוד ${hiddenCount} ${label}`}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "הצג פחות" : `הצג עוד ${label} (${hiddenCount})`}
          <span aria-hidden="true">{expanded ? "−" : "+"}</span>
        </button>
      )}
    </>
  );
}

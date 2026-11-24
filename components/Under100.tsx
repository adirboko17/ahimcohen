"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useCatalog } from "@/lib/catalog-context";
import { useCategoryHistory } from "@/lib/category-history";
import { featuredUnder100, productsUnder100, type BudgetItem } from "@/lib/under-100";
import { ProductTile } from "./ProductTile";
import { CategoryScroller } from "./CategoryScroller";
import { MobileFilterSheet } from "./MobileFilterSheet";
import { ProductListProgress } from "./ProductListProgress";
import { IconFilter } from "./icons";

const collectionPath = "/under-100";

function BudgetGrid({ items }: { items: BudgetItem[] }) {
  return (
    <div className="product-grid budget-grid">
      {items.map(({ product, choice }) => {
        const differentPrice = choice && choice.price !== product.price;
        const varies = product.choices?.some((variant) => variant.available && variant.price !== choice?.price);
        return <ProductTile key={product.id}
          p={differentPrice ? { ...product, price: choice.price, was: undefined } : product}
          imageSrc={choice?.image} selectedColor={choice?.color} selectedSize={varies ? choice?.size : undefined}
        />;
      })}
    </div>
  );
}

export function Under100Section() {
  const { products } = useCatalog();
  const items = useMemo(() => featuredUnder100(productsUnder100(products)), [products]);
  if (!items.length) return null;
  return (
    <section className="wrap budget-section" aria-labelledby="budget-title">
      <div className="sec-head">
        <h2 id="budget-title" className="k sec-title">עד 100 ₪</h2>
        <Link href={collectionPath} className="text-link" aria-label="לכל המוצרים עד 100 ₪">לכל המוצרים</Link>
      </div>
      <BudgetGrid items={items} />
    </section>
  );
}

function listingHref(category: string, sort: string) {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (sort !== "pop") params.set("sort", sort);
  return params.size ? `${collectionPath}?${params}` : collectionPath;
}

function unitPrice({ product, choice }: BudgetItem) {
  return choice?.price ?? product.price;
}

function BudgetResults({ items, scope, paused }: { items: BudgetItem[]; scope: string; paused: boolean }) {
  const { shown, setShown, restoring, rememberBeforeNavigation } = useCategoryHistory(scope, null, collectionPath);
  if (!items.length) return <p>כרגע אין מוצרים זמינים עד 100 ₪.</p>;
  return <div onClickCapture={rememberBeforeNavigation}>
    <BudgetGrid items={items.slice(0, shown)} />
    <ProductListProgress shown={shown} total={items.length} paused={paused || restoring} setShown={setShown} />
  </div>;
}

export function Under100Listing() {
  const { products, categories } = useCatalog();
  const params = useSearchParams();
  const [sheet, setSheet] = useState(false);
  const eligible = useMemo(() => productsUnder100(products), [products]);
  const options = useMemo(() => {
    const ids = new Set(eligible.flatMap(({ product }) => [product.cat, ...(product.cats ?? [])]));
    return categories.filter((category) => ids.has(category.id));
  }, [categories, eligible]);
  const category = options.find((option) => option.id === params.get("category"))?.id ?? "";
  const requestedSort = params.get("sort");
  const sort = requestedSort === "asc" || requestedSort === "desc" ? requestedSort : "pop";
  const items = useMemo(() => {
    const matches = eligible.filter(({ product }) => !category || product.cat === category || product.cats?.includes(category));
    if (sort === "asc") matches.sort((a, b) => unitPrice(a) - unitPrice(b));
    if (sort === "desc") matches.sort((a, b) => unitPrice(b) - unitPrice(a));
    return matches;
  }, [eligible, category, sort]);
  const update = (categoryId: string, order: string) => {
    window.history.replaceState(null, "", listingHref(categoryId, order));
  };
  const scope = listingHref(category, sort);
  const categoryButtons = [{ id: "", name: "הכל" }, ...options].map(({ id, name }) => (
    <button key={id} type="button" aria-pressed={category === id} className={`chip ${category === id ? "on" : "off"}`}
      onClick={() => update(id, sort)}>{name}</button>
  ));
  const sortControl = (
    <select className="plain" aria-label="מיון" value={sort} onChange={(e) => update(category, e.target.value)}>
      <option value="pop">מיון: פופולריים</option>
      <option value="asc">מחיר: נמוך לגבוה</option>
      <option value="desc">מחיר: גבוה לנמוך</option>
    </select>
  );
  return (
    <main className="wrap budget-listing">
      <div className="crumbs"><Link href="/">בית</Link><span>/</span><span className="now">עד 100 ₪</span></div>
      <header className="sec-head">
        <h1 className="k budget-title">מוצרים עד <span>100 ₪</span></h1>
        <span className="muted" role="status">{items.length} מוצרים</span>
      </header>
      <div className="desk">
        <CategoryScroller selected={category || null} label="סינון לפי קטגוריה">{categoryButtons}</CategoryScroller>
        <div className="sort-row budget-sort"><label>מיון {sortControl}</label></div>
      </div>
      <div className="filter-bar mob-grid budget-filter-bar">
        <button type="button" className="btn" aria-haspopup="dialog" aria-expanded={sheet} onClick={() => setSheet(true)}>
          <IconFilter /> סינון{category && " (1)"}
        </button>
        {sortControl}
      </div>
      <BudgetResults key={scope} scope={scope} items={items} paused={sheet} />
      {sheet && <MobileFilterSheet onClose={() => setSheet(false)} footer={(close) => <>
        <button type="button" className="btn btn-line" onClick={() => update("", sort)}>ניקוי</button>
        <button type="button" className="btn" onClick={close}>הצגת {items.length} מוצרים</button>
      </>}>
        <h3>קטגוריה</h3>
        <div className="chip-row" role="group" aria-label="סינון לפי קטגוריה">{categoryButtons}</div>
      </MobileFilterSheet>}
    </main>
  );
}

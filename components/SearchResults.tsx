"use client";

import Form from "next/form";
import { useMemo, useState } from "react";
import { useCatalog } from "@/lib/catalog-context";
import { searchCatalogProducts } from "@/lib/product-search";
import { IconSearch } from "./icons";
import { ProductListProgress } from "./ProductListProgress";
import { ProductTile } from "./ProductTile";

const pageSize = 24;

export function SearchResults({ query }: { query: string }) {
  const { products, category } = useCatalog();
  const [shown, setShown] = useState(pageSize);
  const results = useMemo(() => searchCatalogProducts(products, category, query), [products, category, query]);
  const resultCount = results.length === 1 ? "נמצא מוצר אחד" : `נמצאו ${results.length} מוצרים`;

  return (
    <main className="wrap search-page">
      <header className="search-page-hero">
        <h1 className="k">תוצאות חיפוש</h1>
        <Form action="/search" className="search-page-form" role="search" aria-label="חיפוש מוצרים">
          <IconSearch size={22} />
          <input type="search" name="q" defaultValue={query} aria-label="מה מחפשים?" placeholder="חיפוש מוצר, מותג או מק״ט" autoComplete="off" enterKeyHint="search" />
          <button className="btn btn-yellow" type="submit">חיפוש</button>
        </Form>
      </header>

      {results.length > 0 ? (
        <section className="search-page-results" aria-labelledby="search-page-count">
          <h2 id="search-page-count">{resultCount} עבור <bdi>״{query}״</bdi></h2>
          <div className="product-grid search-page-grid">
            {results.slice(0, shown).map((product) => <ProductTile key={product.id} p={product} />)}
          </div>
          {results.length > pageSize && (
            <ProductListProgress shown={shown} total={results.length} paused={false} setShown={setShown} pageSize={pageSize} />
          )}
        </section>
      ) : (
        <section className="search-empty search-page-empty">
          <span className="search-empty-icon"><IconSearch size={28} /></span>
          <h2>{query ? <>לא מצאנו מוצרים עבור <bdi>״{query}״</bdi></> : "מה מחפשים היום?"}</h2>
          <p>{query ? "נסו שם מוצר אחר, מותג או מק״ט." : "הקלידו שם מוצר, מותג או מק״ט כדי לחפש בקטלוג."}</p>
        </section>
      )}
    </main>
  );
}

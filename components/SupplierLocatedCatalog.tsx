"use client";

import type { LocatedCatalogBatch } from "@/lib/suppliers/catalog-model";
import { useSupplierFeed } from "./useSupplierFeed";

export function SupplierLocatedCatalog({ domain, category, initial, saved }: {
  domain: string;
  category: string;
  initial: LocatedCatalogBatch;
  saved: ReadonlyMap<string, number>;
}) {
  const feed = useSupplierFeed(domain, category, initial, 1, false, "located-catalog-batch");
  const entries = new Map(feed.batches.flatMap(batch => batch.items).map(item => [item.id, item]));
  for (const id of saved.keys()) entries.delete(id);
  if (!entries.size && !feed.more) return null;

  return <section className="supplier-located-catalog" aria-labelledby="supplier-located-heading">
    <header><h3 id="supplier-located-heading">מוצרים שאותרו</h3><small>ממתינים לבדיקת מחיר, מלאי ופרטי המוצר</small></header>
    <div className="supplier-located-scroll">
      <div className="supplier-located-grid">
        {[...entries.values()].map(item => <article className="supplier-located-card" key={item.id}>
          {item.image && <img src={item.image} alt="" loading="lazy" referrerPolicy="no-referrer" />}
          <div><strong><bdi>{item.title}</bdi></strong><small>ממתין לסריקה</small></div>
        </article>)}
      </div>
      {(feed.more || feed.error || feed.loading) && <div ref={feed.sentinel} className="catalog-feed-footer">
        {(feed.loading || feed.error) && <span role="status">{feed.error || "טוען מוצרים שאותרו…"}</span>}
        {!feed.loading && <button type="button" className="btn btn-line" onClick={feed.loadMore}>
          {feed.error ? "נסה שוב" : "טען עוד מוצרים שאותרו"}
        </button>}
      </div>}
    </div>
  </section>;
}

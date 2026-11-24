"use client";

import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import { IconPlus, IconSearch } from "./icons";
import { supplierUrl } from "@/lib/suppliers/catalog-model";

function searchDomain(value: string) {
  return value.trim().toLowerCase().replace(/^https?:\/\//, "").split(/[/?#]/, 1)[0].replace(/^www\./, "");
}

export function SupplierDirectory({ entries }: { entries: { domain: string; card: ReactNode }[] }) {
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const term = searchDomain(query);
  const results = entries.filter(entry => searchDomain(entry.domain).includes(term));

  function clearSearch() {
    setQuery("");
    input.current?.focus();
  }

  return <section className="admin-panel supplier-directory" aria-labelledby="supplier-directory-title">
    <header className="supplier-directory-header">
      <h2 id="supplier-directory-title">האתרים שלי</h2>
      <Link href={supplierUrl(undefined, "add")} className="btn admin-primary"><IconPlus size={16}/>הוסף אתר חדש</Link>
    </header>
    {entries.length > 0 ? <>
      <div className="supplier-directory-tools">
        <div role="search" aria-label="חיפוש ברשימת הספקים" className="supplier-site-search">
          <IconSearch size={19}/>
          <input type="search" ref={input} aria-label="חיפוש אתר לפי דומיין" placeholder="חיפוש אתר לפי דומיין…"
            value={query} onChange={e => setQuery(e.target.value)} autoComplete="off" spellCheck={false}/>
          {query && <button type="button" onClick={clearSearch} aria-label="נקה חיפוש">×</button>}
        </div>
        <span role="status">{term ? `${results.length} מתוך ${entries.length} אתרים` :
          entries.length === 1 ? "אתר אחד" : `${entries.length} אתרים`}</span>
      </div>
      {results.length ? <ul className="supplier-site-grid">{results.map(entry =>
        <li key={entry.domain}>{entry.card}</li>)}</ul> :
        <div className="supplier-sites-empty"><p>לא נמצאו אתרים שמתאימים לחיפוש.</p>
          <button type="button" className="btn btn-line" onClick={clearSearch}>הצג את כל האתרים</button></div>}
    </> : <p className="supplier-sites-empty">הוסיפו את אתר הספק הראשון כדי להתחיל בסריקה.</p>}
  </section>;
}

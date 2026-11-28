"use client";

import { useRef, useState } from "react";
import { IconCheck, IconPlus, IconSearch } from "@/components/icons";
import { brandByName, canonicalBrandName } from "@/lib/brands";

function brandKey(value: string) {
  return value.toLocaleLowerCase().normalize("NFKC").replace(/[\s-]+/g, "");
}

export function ProductBrandPicker({ brands }: { brands: string[] }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState("");
  const [adding, setAdding] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const [customName, setCustomName] = useState("");
  const query = brandKey(search);
  const alias = brandKey(canonicalBrandName(search) ?? "");
  const matches = brands.filter(name => brandKey(name).includes(query) || (alias && brandKey(name) === alias));
  const list = selected && !query ? [selected, ...matches.filter(name => name !== selected)] : matches;
  const canonical = canonicalBrandName(customName);
  const existing = brands.find(name => canonical && brandKey(name) === brandKey(canonical));
  return <section className="np-card" aria-labelledby="np-brand-title">
    <header className="np-card-heading"><h2 id="np-brand-title">מותג</h2>
      <button type="button" className="np-text-action" onClick={() => {
        setAdding(!adding);
        if (!adding) setCustomName(search);
        else requestAnimationFrame(() => searchInput.current?.focus());
      }}>{adding ? "בחירה מהרשימה" : <><IconPlus size={14} />מותג חדש</>}</button>
    </header>
    {adding ? <label className="field">שם המותג<input autoFocus required maxLength={100} dir="auto" value={customName}
      onChange={event => setCustomName(event.target.value)} placeholder="הקלידו שם מותג" />
      {existing && <small>המוצר ישויך למותג הקיים {existing}.</small>}</label> : <>
      <label className="np-search"><IconSearch size={18} /><input ref={searchInput} type="search" aria-label="חיפוש מותג" placeholder="חיפוש מותג לפי שם" value={search}
        onChange={event => { setSearch(event.target.value); event.target.setCustomValidity(""); }}
        onKeyDown={event => { if (event.key === "Enter") {
          event.preventDefault();
          if (matches.length === 1) { setSelected(matches[0]); setSearch(""); }
        } }} /></label>
      <div className="np-brand-grid" role="group" aria-label="מותגים">
        {list.map(name => {
          const logo = brandByName(name)?.logo;
          return <button key={name} aria-pressed={selected === name} type="button" className="np-brand" onClick={() => {
            setSelected(name); setSearch(""); searchInput.current?.setCustomValidity("");
          }}>
            <span className="np-brand-logo">{logo ? <img src={logo} alt="" loading="lazy" /> : <span>{name.slice(0, 1)}</span>}</span>
            <span dir="auto">{name}</span>{selected === name && <IconCheck size={14} />}
          </button>;
        })}
      </div>
      {!matches.length && <p className="np-empty">לא נמצא מותג תואם. אפשר להוסיף אותו דרך ״מותג חדש״.</p>}
    </>}
    <input type="hidden" name="brand" value={adding ? existing || customName.trim() : selected} />
  </section>;
}

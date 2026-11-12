"use client";

import Link from "next/link";
import { phOf, swatchColor, colorLabel, type Product } from "@/lib/catalog";
import { useCatalog } from "@/lib/catalog-context";
import { fmt, saleBadge } from "@/lib/pricing";
import { useStore } from "@/lib/store";
import { IconPlus } from "./icons";

export function ProductTile({ p }: { p: Product }) {
  const { openQuick } = useStore();
  const { category } = useCatalog();
  const catName = category(p.cat)?.name;
  const img = p.imgs?.[0];
  const cols = p.colors || [];
  return (
    <article className="pt">
      <Link href={`/p/${p.id}`} className="pt-media" aria-label={p.name}>
        {img ? <img src={img} alt={p.name} /> : <div className="pt-ph k">{p.std ? p.std.join(" · ") : p.sku || catName}</div>}
        <div className="pt-badges">
          {p.deal && <span className="badge y">{p.deal[0]} ב-{p.deal[1]} ₪</span>}
          {p.was && <span className="badge b">{saleBadge(p)}</span>}
          {!p.was && !p.deal && !!p.best && <span className="badge w">רב מכר</span>}
        </div>
        <button
          className="quick"
          aria-label="הוספה מהירה לסל"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            openQuick(p.id);
          }}
        >
          <IconPlus />
        </button>
      </Link>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <h3>
          <Link href={`/p/${p.id}`}>{p.name}</Link>
        </h3>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <span className="price">{fmt(p.price)}</span>
          {p.was ? <s className="was">{fmt(p.was)}</s> : null}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 14 }}>
          <div className="swatches">
            {cols.slice(0, 5).map((c) => (
              <span key={c} className="swatch-dot" style={{ background: swatchColor(c) }} title={colorLabel(c)} role="img" aria-label={colorLabel(c)} />
            ))}
          </div>
          <span className="muted" style={{ fontSize: 13 }}>
            {cols.length > 1 ? `${cols.length} צבעים` : cols[0] ? colorLabel(cols[0]) : phOf(p)}
          </span>
        </div>
      </div>
    </article>
  );
}

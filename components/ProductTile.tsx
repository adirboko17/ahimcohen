"use client";

import { ProductImage } from "./ProductImage";
import { ProductBrand } from "./ProductBrand";

import Link from "next/link";
import { phOf, swatchColor, colorLabel, type Product } from "@/lib/catalog";
import { useCatalog } from "@/lib/catalog-context";
import { uniqueColors } from "@/lib/colors";
import { fmt, saleBadge } from "@/lib/pricing";
import { fullPhotoProductIds } from "@/lib/product-tile-photos";
import { useStore } from "@/lib/store";
import { IconPlus } from "./icons";

export function ProductTile({ p, imageSrc, selectedColor, selectedSize, priority = false }: { priority?: boolean; p: Product; imageSrc?: string; selectedColor?: string; selectedSize?: string }) {
  const { openQuick } = useStore();
  const { category, colorMappings } = useCatalog();
  const catName = category(p.cat)?.name;
  const img = imageSrc ?? p.imgs?.[0];
  const params = new URLSearchParams();
  if (selectedColor) params.set("color", selectedColor);
  if (selectedSize) params.set("size", selectedSize);
  const query = params.toString();
  const href = `/p/${p.id}${query ? `?${query}` : ""}`;
  const cols = uniqueColors(p.colors || []);
  return (
    <article className="pt">
      <Link href={href} className="pt-media" aria-label={p.name} data-image-fit={fullPhotoProductIds.has(p.id) ? "contain" : undefined}>
        {img ? <ProductImage src={img} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} alt={p.name} /> : <div className="pt-ph k">{p.std ? p.std.join(" · ") : p.sku || catName}</div>}
        <div className="pt-badges">
          {p.deal && <span className="badge y">{p.deal[0]} ב-{p.deal[1]} ₪</span>}
          {p.was && <span className="badge b">{saleBadge(p)}</span>}
          {!p.was && !p.deal && !!p.best && <span className="badge w">רב מכר</span>}
        </div>
        <ProductBrand name={p.brand} />
        <button
          className="quick"
          aria-label="הוספה מהירה לסל"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            openQuick(p.id, { color: selectedColor, size: selectedSize });
          }}
        >
          <IconPlus />
        </button>
      </Link>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {p.promoLabel && <span className="badge y product-promo-label" dir="auto">{p.promoLabel}</span>}
        <h3>
          <Link href={href}>{p.name}</Link>
        </h3>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
          <span className="price">{fmt(p.price)}</span>
          {p.was ? <s className="was">{fmt(p.was)}</s> : null}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 14 }}>
          <div className="swatches">
            {cols.slice(0, 5).map((c) => (
              <span key={c} className="swatch-dot" style={{ background: swatchColor(c, colorMappings) }} title={colorLabel(c)} role="img" aria-label={colorLabel(c)} />
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

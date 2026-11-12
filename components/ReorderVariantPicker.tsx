"use client";

import type { Product } from "@/lib/catalog";
import { colorLabel, matchesColorFilter } from "@/lib/colors";
import { reorderVariantOptions, type ReorderVariantEdit } from "@/lib/reorder";
import { sizeLabel } from "@/lib/sizes";

export function ReorderVariantPicker({ product, color, size, onChange }: {
  product: Product | undefined;
  color: string;
  size: string;
  onChange: (edit: ReorderVariantEdit) => void;
}) {
  if (!product) return <p className="muted" style={{ margin: "8px 0", fontSize: 13 }}>המוצר אינו זמין עוד בקטלוג.</p>;
  const options = reorderVariantOptions(product, color);
  const selectedColor = options.colors.find((option) => matchesColorFilter([option.label], [color]))?.label ?? colorLabel(color);
  const selectedSize = sizeLabel(size) || "מידה אחת";
  const colorExists = options.colors.some((option) => option.label === selectedColor);
  const sizeExists = options.sizes.some((option) => option.label === selectedSize);
  const available = options.sizes.some((option) => option.label === selectedSize && option.available);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, flex: "1 1 120px", minWidth: 0 }}>
          צבע
          <select className="plain" aria-label={`צבע עבור ${product.name}`} value={selectedColor} onChange={(event) => onChange({ color: event.target.value })} style={{ width: "100%", minWidth: 0, height: 42 }}>
            {!colorExists && <option value={selectedColor} disabled>{selectedColor || "ללא צבע"} — לא זמין</option>}
            {options.colors.map((option) => <option key={option.label} value={option.label} disabled={!option.available}>{option.label || "ללא צבע"}{option.available ? "" : " — לא במלאי"}</option>)}
          </select>
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, flex: "1 1 100px", minWidth: 0 }}>
          מידה
          <select className="plain" aria-label={`מידה עבור ${product.name}`} value={selectedSize} onChange={(event) => onChange({ size: event.target.value })} style={{ width: "100%", minWidth: 0, height: 42 }}>
            {!sizeExists && <option value={selectedSize} disabled>{selectedSize} — לא זמינה</option>}
            {options.sizes.map((option) => <option key={option.label} value={option.label} disabled={!option.available}>{option.label}{option.available ? "" : " — לא זמינה בצבע זה"}</option>)}
          </select>
        </label>
      </div>
      {!available && <span className="err" style={{ fontSize: 13 }}>השילוב שנבחר אינו זמין. בחרו צבע ומידה זמינים כדי להוסיף את הפריט.</span>}
    </div>
  );
}

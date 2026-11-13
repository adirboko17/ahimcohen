"use client";

import { useState } from "react";
import { colorLabel, phOf, type Product } from "@/lib/catalog";
import { cartProductImage } from "@/lib/product-selection";
import { productSizeOptions, sizeLabel } from "@/lib/sizes";
import { fmt } from "@/lib/pricing";
import { useStore } from "@/lib/store";
import type { CartLine } from "@/lib/types";
import { ProductImage } from "./ProductImage";

export function CartItem({ line, product, disabled = false, unitNumber }: { line: CartLine; product: Product; disabled?: boolean; unitNumber?: number }) {
  const { setQtyLine, setLineSelection, setUnitSelection, cartQuote } = useStore();
  const quoted = line.variantId ? cartQuote.quote?.lines[line.variantId] : undefined;
  const total = quoted ? quoted.total * line.qty / quoted.quantity : line.qty * (line.unitPrice ?? product.price);
  const regular = quoted ? quoted.regular * line.qty / quoted.quantity : total;
  const [editing, setEditing] = useState(false);
  const [color, setColor] = useState(line.color);
  const [size, setSize] = useState(sizeLabel(line.size) || "מידה אחת");
  const sizes = productSizeOptions(product, color).filter((option) => option.available);
  const selected = sizes.find((option) => option.label === size);
  const preview = editing ? { color, size: selected?.value ?? "", variantId: undefined } : line;
  const img = cartProductImage(product, preview);
  const edit = () => {
    setColor(line.color);
    setSize(sizeLabel(line.size) || "מידה אחת");
    setEditing(true);
  };

  return (
    <div className="line">
      <div className="line-ph">
        {img ? <ProductImage src={img} sizes="80px" maxWidth={320} alt={product.name} /> : <span className="k cart-placeholder">{phOf(product)}</span>}
      </div>
      <div className="cart-item-copy">
        <div className="cart-item-heading">
          <span>{unitNumber ? `יחידה ${unitNumber}` : product.name}</span>
          {!unitNumber && <strong aria-live="polite">{cartQuote.error ? "המחיר לא זמין" : <>{regular > total && <s className="muted cart-item-was">{fmt(regular)}</s>}<span className="cart-item-price">{fmt(total)}</span>{cartQuote.pending && <small className="price-estimate-label">משוער</small>}</>}</strong>}
        </div>
        <span className="muted cart-item-meta">{[colorLabel(line.color), sizeLabel(line.size) || "מידה אחת"].filter(Boolean).join(" · ")}</span>
        {!editing && <button type="button" className="cart-edit-link" disabled={disabled} onClick={edit}>שינוי צבע ומידה</button>}
        {editing && (
          <div className="cart-item-editor">
            {product.colors.length > 0 && <label>
              צבע
              <select className="plain" aria-label={unitNumber ? `צבע ליחידה ${unitNumber}` : "צבע"} disabled={disabled} value={color} onChange={(event) => {
                const next = event.target.value;
                setColor(next);
                if (!productSizeOptions(product, next).some((option) => option.available && option.label === size)) setSize("");
              }}>
                {!product.colors.includes(color) && <option value={color} disabled>{colorLabel(color)}</option>}
                {product.colors.map((value) => <option key={value} value={value} disabled={!productSizeOptions(product, value).some((option) => option.available)}>{colorLabel(value)}</option>)}
              </select>
            </label>}
            <label>
              מידה
              <select className="plain" aria-label={unitNumber ? `מידה ליחידה ${unitNumber}` : "מידה"} disabled={disabled} value={selected?.label ?? ""} onChange={(event) => setSize(event.target.value)}>
                <option value="" disabled>בחרו מידה</option>
                {sizes.map((option) => <option key={option.label} value={option.label}>{option.label}</option>)}
              </select>
            </label>
            <div className="cart-edit-actions">
              <button type="button" className="btn" disabled={disabled || !selected} onClick={() => {
                if (!selected) return;
                (unitNumber ? setUnitSelection : setLineSelection)(line.key, { color, size: selected.label });
                setEditing(false);
              }}>שמירה</button>
              <button type="button" className="btn btn-line" disabled={disabled} onClick={() => setEditing(false)}>ביטול</button>
            </div>
          </div>
        )}
        <div className="cart-item-actions">
          {!unitNumber && <div className="qty-sm">
            <button disabled={disabled} onClick={() => setQtyLine(line.key, 1)} aria-label="הוספה">+</button>
            <span className="cart-qty-value">{line.qty}</span>
            <button disabled={disabled} onClick={() => setQtyLine(line.key, -1)} aria-label="הפחתה">−</button>
          </div>}
          {unitNumber && <button className="cart-edit-link" disabled={disabled} onClick={() => setQtyLine(line.key, 1)}>הוספת יחידה זהה</button>}
          <button className="cart-edit-link" disabled={disabled} onClick={() => setQtyLine(line.key, unitNumber ? -1 : -9999)}>{unitNumber ? "הסרת יחידה" : "הסרה"}</button>
        </div>
      </div>
    </div>
  );
}

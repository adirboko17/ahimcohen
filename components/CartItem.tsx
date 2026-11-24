"use client";

import { useState } from "react";
import { colorLabel, phOf, type Product } from "@/lib/catalog";
import { useCatalog } from "@/lib/catalog-context";
import { cartProductImage } from "@/lib/product-selection";
import { productSizeOptions, sizeLabel } from "@/lib/sizes";
import { fmt } from "@/lib/pricing";
import { useStore } from "@/lib/store";
import type { CartLine } from "@/lib/types";
import { ProductImage } from "./ProductImage";

function CartSetParts({ product, variantId, editing, disabled, onVariant }: {
  product: Product; variantId?: string; editing: boolean; disabled: boolean; onVariant: (id: string) => void;
}) {
  const catalog = useCatalog();
  const contents = product.setContents!;
  const picked = contents.variants.find(v => v.id === variantId);
  const available = new Set(editing ? product.choices?.filter(v => v.available).map(v => v.id) : []);
  return <ul className="cart-set-parts" aria-label="הפריטים בסט">{contents.productIds.map((id, index) => {
    const item = catalog.product(id);
    if (!item) return <li key={id}>פריט מהסט אינו זמין בקטלוג</li>;
    const choice = item.choices?.find(v => v.id === picked?.components[index]);
    const img = choice ? cartProductImage(item, { variantId: choice.id, color: choice.color, size: choice.size }) : item.imgs?.[0];
    const options = editing && picked ? contents.variants.filter(v => available.has(v.id) &&
      v.components.every((part, i) => i === index || part === picked.components[i])) : [];
    const label = (color: string, size: string) => [colorLabel(color), sizeLabel(size) || "מידה אחת"].filter(Boolean).join(" · ");
    return <li key={id}>
      <div className="cart-set-photo">{img ? <ProductImage src={img} sizes="52px" maxWidth={160} alt="" /> : phOf(item)}</div>
      <div className="cart-set-part-copy">
        <strong>{item.name}</strong>
        {options.length > 1 ? <select className="plain" aria-label={`צבע ומידה עבור ${item.name}`} disabled={disabled} value={variantId}
          onChange={e => onVariant(e.target.value)}>
          {options.map(v => {
            const option = item.choices!.find(c => c.id === v.components[index])!;
            return <option key={v.id} value={v.id}>{label(option.color, option.size)}</option>;
          })}
        </select> : choice && <span className="muted">{label(choice.color, choice.size)}</span>}
      </div>
    </li>;
  })}</ul>;
}

export function CartItem({ line, product, disabled = false, unitNumber }: { line: CartLine; product: Product; disabled?: boolean; unitNumber?: number }) {
  const catalog = useCatalog();
  const { setQtyLine, setLineSelection, setUnitSelection, cartQuote } = useStore();
  const quoted = line.variantId ? cartQuote.quote?.lines[line.variantId] : undefined;
  const total = quoted ? quoted.total * line.qty / quoted.quantity : line.qty * (line.unitPrice ?? product.price);
  const regular = quoted ? quoted.regular * line.qty / quoted.quantity : total;
  const [editing, setEditing] = useState(false);
  const [color, setColor] = useState(line.color);
  const [size, setSize] = useState(sizeLabel(line.size) || "מידה אחת");
  const set = product.setContents;
  const savedVariant = line.variantId ?? product.choices?.find(v => v.size === line.size && v.color === line.color)?.id;
  const [editVariant, setEditVariant] = useState(savedVariant);
  const selectedSetChoice = editing && set && product.choices?.find(v => v.id === editVariant && v.available);
  const sizes = set ? [] : productSizeOptions(product, color).filter((option) => option.available);
  const selected = sizes.find((option) => option.label === size);
  const preview = editing ? { color, size: selected?.value ?? "", variantId: undefined } : line;
  const img = cartProductImage(product, preview);
  const source = line.packUnits && product.bundleSourceId ? catalog.product(product.bundleSourceId) : undefined;
  const edit = () => {
    setEditVariant(savedVariant);
    setColor(line.color);
    setSize(sizeLabel(line.size) || "מידה אחת");
    setEditing(true);
  };

  return (
    <div className={set ? "cart-set-card" : "line"}>
      {!set && <div className="line-ph">
        {img ? <ProductImage src={img} sizes="80px" maxWidth={320} alt={product.name} /> : <span className="k cart-placeholder">{phOf(product)}</span>}
      </div>}
      <div className="cart-item-copy">
        <div className="cart-item-heading">
          {set ? <div className="cart-set-title"><b>סט מוצרים</b><small>{set.productIds.length} פריטים בסט</small></div>
            : <span>{unitNumber ? `יחידה ${unitNumber}` : product.name}</span>}
          {!unitNumber && <strong aria-live="polite">{cartQuote.error ? "המחיר לא זמין" : <>{regular > total && <s className="muted cart-item-was">{fmt(regular)}</s>}<span className="cart-item-price">{fmt(total)}</span>{cartQuote.pending && <small className="price-estimate-label">משוער</small>}</>}</strong>}
        </div>
        {set ? <CartSetParts product={product} variantId={editing ? editVariant : savedVariant} editing={editing} disabled={disabled} onVariant={setEditVariant} />
          : line.packUnits ? <span className="muted cart-item-meta">{line.packUnits.map(({ variantId, quantity }) => {
          const choice = source?.choices?.find(({ id }) => id === variantId);
          return choice ? `${quantity} × ${[colorLabel(choice.color), sizeLabel(choice.size) || "מידה אחת"].filter(Boolean).join(" · ")}` : `${quantity} × מק״ט ${variantId.split("/").pop()}`;
        }).join(" / ")}</span> : <span className="muted cart-item-meta">{[colorLabel(line.color), sizeLabel(line.size) || "מידה אחת"].filter(Boolean).join(" · ")}</span>}
        {!editing && !line.packUnits && (!set || (product.choices?.length ?? 0) > 1) && <button type="button" className="cart-edit-link" disabled={disabled} onClick={edit}>{set ? "עריכת בחירות בסט" : "שינוי צבע ומידה"}</button>}
        {editing && (
          <div className="cart-item-editor">
            {!set && product.colors.length > 0 && <label>
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
            {!set && <label>
              מידה
              <select className="plain" aria-label={unitNumber ? `מידה ליחידה ${unitNumber}` : "מידה"} disabled={disabled} value={selected?.label ?? ""} onChange={(event) => setSize(event.target.value)}>
                <option value="" disabled>בחרו מידה</option>
                {sizes.map((option) => <option key={option.label} value={option.label}>{option.label}</option>)}
              </select>
            </label>}
            <div className="cart-edit-actions">
              <button type="button" className="btn" disabled={disabled || !(set ? selectedSetChoice : selected)} onClick={() => {
                if (set && selectedSetChoice) setLineSelection(line.key, { color: "", size: selectedSetChoice.size });
                else if (!set && selected) (unitNumber ? setUnitSelection : setLineSelection)(line.key, { color, size: selected.label });
                setEditing(false);
              }}>שמירה</button>
              <button type="button" className="btn btn-line" disabled={disabled} onClick={() => setEditing(false)}>ביטול</button>
            </div>
          </div>
        )}
        <div className="cart-item-actions">
          {!unitNumber && <div className="qty-sm">
            <button disabled={disabled} onClick={() => setQtyLine(line.key, 1)} aria-label={set ? "הוספת סט" : "הוספה"}>+</button>
            <span className="cart-qty-value">{line.qty}</span>
            <button disabled={disabled} onClick={() => setQtyLine(line.key, -1)} aria-label={set ? "הפחתת סט" : "הפחתה"}>−</button>
          </div>}
          {unitNumber && <button className="cart-edit-link" disabled={disabled} onClick={() => setQtyLine(line.key, 1)}>הוספת יחידה זהה</button>}
          <button className="cart-edit-link" disabled={disabled} onClick={() => setQtyLine(line.key, unitNumber ? -1 : -9999)}>{set ? "הסרת הסט" : unitNumber ? "הסרת יחידה" : "הסרה"}</button>
        </div>
      </div>
    </div>
  );
}

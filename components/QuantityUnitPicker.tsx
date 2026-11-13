"use client";

import { colorLabel, type Product } from "@/lib/catalog";
import { productSizeOptions } from "@/lib/sizes";
import { changeQuantityUnitColor, type QuantityUnit, type quantitySelection } from "@/lib/quantity-selection";

export function QuantityUnitPicker({ product, rows, showErrors, onChange, disabled = false }: {
  product: Product;
  rows: ReturnType<typeof quantitySelection>["rows"];
  showErrors: boolean;
  onChange: (index: number, selection: QuantityUnit) => void;
  disabled?: boolean;
}) {
  return <div className="buy-pad quantity-unit-picker">
    <div className="quantity-unit-heading"><b>צבע ומידה לכל יחידה</b></div>
    <p className="muted">אפשר לשלב צבעים ומידות באותו מבצע. בחרו את הפרטים של כל יחידה.</p>
    {rows.map((row, index) => <fieldset className="quantity-unit-row" key={index} disabled={disabled}>
      <legend>יחידה {index + 1}</legend>
      <div className="quantity-unit-fields">
        {product.colors.length > 0 && <label>צבע
          <select className="plain" aria-label={`צבע ליחידה ${index + 1}`} value={row.selection.color} onChange={(event) => onChange(index, changeQuantityUnitColor(product, row.selection, Number(event.target.value)))}>
            {product.colors.map((color, colorIndex) => <option key={color} value={colorIndex} disabled={!productSizeOptions(product, color).some((option) => option.available)}>{colorLabel(color)}</option>)}
          </select>
        </label>}
        <label>מידה
          <select className="plain" aria-label={`מידה ליחידה ${index + 1}`} aria-invalid={showErrors && !row.valid} data-missing={!row.valid ? "true" : undefined} value={row.option?.label ?? ""} onChange={(event) => onChange(index, { ...row.selection, size: event.target.value })}>
            <option value="" disabled>בחרו מידה</option>
            {row.options.map((option) => <option key={option.label} value={option.label} disabled={!option.available}>{option.label}{!option.available ? " — אזל במלאי" : ""}</option>)}
          </select>
        </label>
      </div>
      {showErrors && !row.valid && <span className="err">בחרו צבע ומידה זמינים ליחידה {index + 1}</span>}
    </fieldset>)}
  </div>;
}

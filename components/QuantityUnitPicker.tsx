"use client";

import { colorLabel, type Product } from "@/lib/catalog";
import { productSizeOptions, sizeLabel } from "@/lib/sizes";
import { changeQuantityUnitColor, type QuantityUnit, type quantitySelection } from "@/lib/quantity-selection";

export function QuantityUnitPicker({ product, rows, showErrors, onChange, disabled = false, selectByVariant = false }: {
  product: Product;
  rows: ReturnType<typeof quantitySelection>["rows"];
  showErrors: boolean;
  onChange: (index: number, selection: QuantityUnit) => void;
  disabled?: boolean;
  selectByVariant?: boolean;
}) {
  return <div className="buy-pad quantity-unit-picker">
    <div className="quantity-unit-heading"><b>{selectByVariant ? "בחירת וריאציה לכל יחידה" : "צבע ומידה לכל יחידה"}</b></div>
    <p className="muted">{selectByVariant ? "אפשר לשלב וריאציות שונות באותה חבילה." : "אפשר לשלב צבעים ומידות באותו מבצע. בחרו את הפרטים של כל יחידה."}</p>
    {rows.map((row, index) => <fieldset className="quantity-unit-row" key={index} disabled={disabled}>
      <legend>יחידה {index + 1}</legend>
      <div className="quantity-unit-fields" data-variant-select={selectByVariant || undefined}>
        {selectByVariant ? <label>וריאציה
          <select className="plain" aria-label={`וריאציה ליחידה ${index + 1}`} aria-invalid={showErrors && !row.valid}
            data-missing={!row.valid ? "true" : undefined} value={row.variant?.id ?? ""} onChange={(event) => {
              const choice = product.choices?.find(({ id }) => id === event.target.value);
              if (choice?.available) onChange(index, { variantId: choice.id, color: Math.max(0, product.colors.indexOf(choice.color)), size: choice.size });
            }}>
            <option value="" disabled>בחרו וריאציה</option>
            {product.choices?.map((choice) => <option key={choice.id} value={choice.id} disabled={!choice.available}>
              {choice.optionsLabel || [colorLabel(choice.color), sizeLabel(choice.size) || "מידה אחת"].filter(Boolean).join(" · ")}{!choice.available ? " - אזל במלאי" : ""}
            </option>)}
          </select>
        </label> : <>
          {product.colors.length > 0 && <label>צבע
            <select className="plain" aria-label={`צבע ליחידה ${index + 1}`} value={row.selection.color} onChange={(event) => onChange(index, changeQuantityUnitColor(product, row.selection, Number(event.target.value)))}>
              {product.colors.map((color, colorIndex) => <option key={color} value={colorIndex} disabled={!productSizeOptions(product, color).some((option) => option.available)}>{colorLabel(color)}</option>)}
            </select>
          </label>}
          <label>מידה
            <select className="plain" aria-label={`מידה ליחידה ${index + 1}`} aria-invalid={showErrors && !row.valid} data-missing={!row.valid ? "true" : undefined} value={row.option?.label ?? ""} onChange={(event) => onChange(index, { ...row.selection, size: event.target.value })}>
              <option value="" disabled>בחרו מידה</option>
              {row.options.map((option) => <option key={option.label} value={option.label} disabled={!option.available}>{option.label}{!option.available ? " - אזל במלאי" : ""}</option>)}
            </select>
          </label>
        </>}
      </div>
      {showErrors && !row.valid && <span className="err">{selectByVariant ? "בחרו וריאציה זמינה" : "בחרו צבע ומידה זמינים"} ליחידה {index + 1}</span>}
    </fieldset>)}
  </div>;
}

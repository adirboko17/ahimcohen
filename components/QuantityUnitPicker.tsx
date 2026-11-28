"use client";

import { colorLabel, swatchColor, type Product } from "@/lib/catalog";
import { useCatalog } from "@/lib/catalog-context";
import { productSizeOptions, sizeLabel } from "@/lib/sizes";
import { changeQuantityUnitColor, type QuantityUnit, type quantitySelection } from "@/lib/quantity-selection";
import { UnitSwatchSelect } from "./UnitSwatchSelect";

export function QuantityUnitPicker({ product, rows, showErrors, onChange, disabled = false, selectByVariant = false }: {
  product: Product;
  rows: ReturnType<typeof quantitySelection>["rows"];
  showErrors: boolean;
  onChange: (index: number, selection: QuantityUnit) => void;
  disabled?: boolean;
  selectByVariant?: boolean;
}) {
  const { colorMappings } = useCatalog();
  const colorOptions = selectByVariant ? [] : product.colors.map((color, index) => ({
    value: String(index), label: colorLabel(color), swatch: swatchColor(color, colorMappings),
    disabled: !productSizeOptions(product, color).some(option => option.available),
  }));
  const variantOptions = selectByVariant ? (product.choices ?? []).map(choice => ({
    value: choice.id, disabled: !choice.available, swatch: choice.color ? swatchColor(choice.color, colorMappings) : undefined,
    label: (choice.optionsLabel || [colorLabel(choice.color), sizeLabel(choice.size) || "מידה אחת"].filter(Boolean).join(" · ")) +
      (choice.available ? "" : " - אזל במלאי"),
  })) : [];
  function selectVariant(index: number, value: string) {
    const choice = product.choices?.find(({ id }) => id === value);
    if (choice?.available) onChange(index, { variantId: choice.id, color: Math.max(0, product.colors.indexOf(choice.color)), size: choice.size });
  }
  return <div className="buy-pad quantity-unit-picker">
    <div className="quantity-unit-heading"><b>{selectByVariant ? "בחירת וריאציה לכל יחידה" : "צבע ומידה לכל יחידה"}</b></div>
    <p className="muted">{selectByVariant ? "אפשר לשלב וריאציות שונות באותה חבילה." : "אפשר לשלב צבעים ומידות באותו מבצע. בחרו את הפרטים של כל יחידה."}</p>
    {rows.map((row, index) => <fieldset className="quantity-unit-row" key={index} disabled={disabled}>
      <legend>יחידה {index + 1}</legend>
      <div className="quantity-unit-fields" data-variant-select={selectByVariant || undefined}>
        {selectByVariant ? (variantOptions.some(option => option.swatch)
          ? <UnitSwatchSelect label="וריאציה" unit={index + 1} options={variantOptions} value={row.variant?.id ?? ""} placeholder="בחרו וריאציה"
              invalid={showErrors && !row.valid} missing={!row.valid} onChange={value => selectVariant(index, value)} />
          : <label>וריאציה
          <select className="plain" aria-label={`וריאציה ליחידה ${index + 1}`} aria-invalid={showErrors && !row.valid}
            data-missing={!row.valid ? "true" : undefined} value={row.variant?.id ?? ""} onChange={event => selectVariant(index, event.target.value)}>
            <option value="" disabled>בחרו וריאציה</option>
            {variantOptions.map(option => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}
          </select>
        </label>) : <>
          {colorOptions.length > 0 && <UnitSwatchSelect label="צבע" unit={index + 1} options={colorOptions}
            value={String(row.selection.color)} placeholder="בחרו צבע" onChange={value => onChange(index, changeQuantityUnitColor(product, row.selection, Number(value)))} />}
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

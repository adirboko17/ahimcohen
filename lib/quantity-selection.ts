import type { Product } from "./catalog";
import { productSizeOptions, sizeLabel } from "./sizes";
import type { AddItem, CartLine } from "./types";

export type QuantityUnit = { color: number; size: string | null };

export function resolveQuantityUnit(product: Product, selection: QuantityUnit) {
  const color = product.colors[selection.color] ?? "";
  const options = productSizeOptions(product, color);
  const label = selection.size == null ? null : sizeLabel(selection.size) || "מידה אחת";
  const option = options.find((entry) => entry.available && entry.label === label);
  // Never fall back to a different variant when this unit is unavailable.
  const variant = option && product.choices?.find((choice) => choice.available && choice.color === color && choice.size === option.value);
  const validColor = product.colors.length ? selection.color >= 0 && selection.color < product.colors.length : selection.color === 0;
  const valid = validColor && !!option && (!product.choices?.length || !!variant);
  return { selection, color, options, option, variant, valid };
}

export function changeQuantityUnitColor(product: Product, selection: QuantityUnit, color: number): QuantityUnit {
  const next = { ...selection, color };
  const resolved = resolveQuantityUnit(product, next);
  return { color, size: resolved.valid ? selection.size : resolved.options.length === 1 && resolved.options[0].available ? resolved.options[0].label : null };
}

export function quantitySelection(product: Product, selections: QuantityUnit[]) {
  const rows = selections.map((selection) => resolveQuantityUnit(product, selection));
  const complete = rows.length > 0 && rows.every((row) => row.valid);
  const items: AddItem[] = [];
  const quoteLines: Pick<CartLine, "pid" | "color" | "size" | "qty" | "variantId">[] = [];
  if (complete) {
    const grouped = new Map<string, number>();
    for (const row of rows) {
      const rawSize = row.option!.value;
      const key = row.variant?.id ?? JSON.stringify([row.color, rawSize]);
      const existing = grouped.get(key);
      if (existing !== undefined) {
        items[existing][3]++;
        quoteLines[existing].qty++;
      } else {
        grouped.set(key, items.length);
        items.push([product.id, row.selection.color, rawSize, 1]);
        quoteLines.push({ pid: product.id, color: row.color, size: rawSize, qty: 1, variantId: row.variant?.id });
      }
    }
  }
  return { rows, complete, items, quoteLines };
}

import type { Product } from "./catalog";
import type { CartLine } from "./types";
import { colorLabel, matchesColorFilter } from "./colors";
import { sizeLabel } from "./sizes";
import { resolveQuantityUnit, type QuantityUnit } from "./quantity-selection";

export function cartUnitPresets(product: Product, lines: CartLine[]) {
  const seen = new Set<string>();
  return lines.flatMap((line) => {
    const variant = product.choices?.find((choice) => choice.id === line.variantId);
    const rawColor = variant?.color ?? line.color;
    const exact = product.colors.indexOf(rawColor);
    const color = !product.colors.length && !rawColor ? 0 : exact >= 0 ? exact : product.colors.findIndex((value) => matchesColorFilter([value], [rawColor]));
    const size = sizeLabel(variant?.size ?? line.size) || "מידה אחת";
    const selection: QuantityUnit = { color, size };
    const key = JSON.stringify([color >= 0 ? color : rawColor, size]);
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ key, selection, label: [colorLabel(rawColor), size].filter(Boolean).join(" · "), available: resolveQuantityUnit(product, selection).valid }];
  });
}

import { pickVariant, type Product } from "./catalog";
import type { AddItem, OrderLine } from "./types";
import { colorLabel, matchesColorFilter, uniqueColors } from "./colors";
import { productSizeOptions, sizeLabel } from "./sizes";

export type ReorderVariantEdit = { color?: string; size?: string };

export function reorderVariantOptions(product: Product, selectedColor: string) {
  const rawColors = (label: string) => product.colors.length
    ? product.colors.filter((color) => matchesColorFilter([color], [label]))
    : label === "" ? [""] : [];
  const colors = (product.colors.length ? uniqueColors(product.colors) : [""]).map((label) => ({
    label,
    // Allow switching to a color with other sizes in stock, even if the current
    // size is sold out. The user then chooses the replacement size explicitly.
    available: rawColors(label).some((color) => productSizeOptions(product, color).some((size) => size.available)),
  }));
  const selectedOptions = rawColors(selectedColor).flatMap((color) => productSizeOptions(product, color));
  const sizes = productSizeOptions(product).map(({ label }) => ({
    label,
    available: selectedOptions.some((size) => size.label === label && size.available),
  }));
  return { colors, sizes };
}

export function prepareReorder(lines: readonly OrderLine[], productById: (id: string) => Product | undefined) {
  const items: AddItem[] = [];
  const unavailable: { pid: string; name: string; size: string; color: string; quantity: number }[] = [];
  for (const [pid, orderedColor, orderedSize, quantity] of lines) {
    const product = productById(pid);
    const label = sizeLabel(orderedSize) || "מידה אחת";
    // Resolve the historical name against today's colors; list positions may
    // have changed. An old index without a saved name cannot be recovered safely.
    const colorIndices = product && typeof orderedColor === "string"
      ? product.colors.length
        ? product.colors.flatMap((color, index) => orderedColor.trim() && matchesColorFilter([color], [orderedColor]) ? [index] : [])
        : orderedColor.trim() === "" ? [0] : []
      : [];
    // Prefer the original spelling when available, then try equivalent aliases
    // for the same size. Never fall back to another shade or another size.
    colorIndices.sort((a, b) => Number(product!.colors[b]?.trim().toLowerCase() === orderedColor.trim().toLowerCase()) -
      Number(product!.colors[a]?.trim().toLowerCase() === orderedColor.trim().toLowerCase()));
    let resolved: AddItem | undefined;
    for (const colorIndex of colorIndices) {
      const option = productSizeOptions(product!, product!.colors[colorIndex] || "")
        .find((size) => size.label === label && size.available);
      if (option) {
        resolved = [pid, colorIndex, option.value, quantity];
        break;
      }
    }
    if (!resolved || !Number.isSafeInteger(quantity) || quantity <= 0) {
      unavailable.push({
        pid,
        name: product?.name || `מוצר שאינו זמין יותר (${pid})`,
        size: label,
        color: typeof orderedColor === "string" ? colorLabel(orderedColor) : "צבע לא ידוע",
        quantity,
      });
      continue;
    }
    items.push(resolved);
  }
  // Callers must show missing lines before offering to add just these items.
  // Every returned item has a matching size/color; no variant fallback is used.
  return { items, unavailable };
}

export function previewReorder(
  lines: readonly OrderLine[],
  productById: (id: string) => Product | undefined,
  quantities: Readonly<Record<number, number>> = {},
  variants: Readonly<Record<number, ReorderVariantEdit>> = {},
) {
  const result = {
    items: [] as AddItem[],
    unavailable: [] as (ReturnType<typeof prepareReorder>["unavailable"][number] & { sourceIndex: number })[],
  };
  const sourceIndices: number[] = [];
  // Keep edits tied to the original line, even when earlier lines are removed
  // or become unavailable. Zero means explicitly removed from this draft only.
  lines.forEach(([pid, color, size, originalQuantity], sourceIndex) => {
    const quantity = quantities[sourceIndex] ?? originalQuantity;
    if (quantity === 0) return;
    const selection = variants[sourceIndex];
    const resolved = prepareReorder([[pid, selection?.color ?? color, selection?.size ?? size, quantity]], productById);
    result.items.push(...resolved.items);
    sourceIndices.push(...resolved.items.map(() => sourceIndex));
    result.unavailable.push(...resolved.unavailable.map((line) => ({ ...line, sourceIndex })));
  });
  const available = result.items.map(([pid, colorIndex, size, quantity], index) => {
    const product = productById(pid)!;
    const rawColor = product.colors[colorIndex] || "";
    const variant = pickVariant(product, rawColor, size);
    // Match StoreProvider.addMany: the current variant price is stored on the
    // cart line, not the historical price or the product's starting price.
    const unitPrice = variant?.price ?? product.price;
    return {
      sourceIndex: sourceIndices[index],
      pid,
      variantId: variant?.id,
      name: product.name,
      color: colorLabel(rawColor),
      size: sizeLabel(size) || "מידה אחת",
      quantity,
      unitPrice,
      lineTotal: unitPrice * quantity,
    };
  });
  return {
    ...result,
    available,
    total: available.reduce((sum, line) => sum + line.lineTotal, 0),
    quantity: available.reduce((sum, line) => sum + line.quantity, 0),
  };
}

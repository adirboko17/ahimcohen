import type { Product } from "./catalog";
import type { CartLine } from "./types";
import { matchesColorFilter } from "./colors";
import { productSizeOptions, sizeLabel } from "./sizes";

// Change exactly one physical unit, even when identical variants share a cart line.
export function updateCartUnitSelection(cart: CartLine[], key: string, product: Product, selection: { color: string; size: string }, instanceId: string): CartLine[] {
  const source = cart.find((line) => line.key === key && line.pid === product.id);
  if (!source) return cart;
  const single = [{ ...source, qty: 1 }];
  const changed = updateCartSelection(single, key, product, selection);
  if (changed === single || changed[0].key === source.key) return cart;
  const replacement = { ...changed[0], instanceId };
  const target = cart.find((line) => line.key !== key && line.pid === product.id &&
    (line.key === replacement.key || (!!replacement.variantId && line.variantId === replacement.variantId)));
  return cart.flatMap((line) => {
    if (line.key === key) return source.qty > 1 ? [{ ...source, qty: source.qty - 1 }, ...(!target ? [replacement] : [])] : !target ? [replacement] : [];
    if (line === target) return [{ ...line, qty: line.qty + 1, unitPrice: replacement.unitPrice }];
    return [line];
  });
}

export function updateCartSelection(cart: CartLine[], key: string, product: Product, selection: { color: string; size: string }): CartLine[] {
  const line = cart.find((item) => item.key === key && item.pid === product.id);
  if (!line) return cart;
  const color = product.colors.find((value) => value === selection.color)
    ?? product.colors.find((value) => matchesColorFilter([value], [selection.color]))
    ?? (product.colors.length === 0 && !selection.color ? "" : undefined);
  if (color === undefined) return cart;
  const size = productSizeOptions(product, color).find((option) => option.available && option.label === sizeLabel(selection.size));
  if (!size) return cart;
  const variant = product.choices?.find((choice) => choice.available && choice.color === color && choice.size === size.value);
  if (product.choices?.length && !variant) return cart;
  const updated: CartLine = {
    ...line, key: `${product.id}|${color}|${size.value}`, color, size: size.value,
    variantId: variant?.id, unitPrice: variant?.price ?? product.price,
  };
  const duplicate = cart.find((item) => item.key !== key && item.pid === product.id &&
    (item.key === updated.key || (!!variant && item.variantId === variant.id)));
  if (duplicate) return cart.filter((item) => item.key !== key).map((item) =>
    item.key === duplicate.key ? { ...updated, qty: item.qty + line.qty } : item);
  return cart.map((item) => item.key === key ? updated : item);
}

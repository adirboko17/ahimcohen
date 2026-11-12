import type { Product } from "./catalog";
import { matchesColorFilter } from "./colors";
import { categoryProductImage } from "./category-filters";
import { matchesSizeFilter } from "./sizes";
import type { CartLine } from "./types";

export function cartProductImage(product: Product, line: Pick<CartLine, "color" | "size" | "variantId">): string | undefined {
  const choices = (product.choices ?? []).filter((choice) => matchesColorFilter([choice.color], line.color ? [line.color] : []));
  const exact = choices.find((choice) => choice.id === line.variantId && choice.image);
  const sized = choices.find((choice) => matchesSizeFilter([choice.size], [line.size]) && choice.image);
  return exact?.image ?? sized?.image ?? choices.find((choice) => choice.image)?.image ?? product.imgs?.[0];
}

export function productColorIndex(product: Product, requestedColor?: string, requestedSize?: string): number {
  if (requestedColor) return Math.max(0, product.colors.findIndex((color) => matchesColorFilter([color], [requestedColor])));
  if (requestedSize) {
    const choice = product.choices?.find((choice) => choice.available && matchesSizeFilter([choice.size], [requestedSize]));
    if (choice) return Math.max(0, product.colors.findIndex((color) => matchesColorFilter([color], [choice.color])));
  }
  return 0;
}

export function productGalleryImages(product: Product, color: string): string[] {
  const selected = categoryProductImage(product, { colors: color ? [color] : [], sizes: [], stock: false });
  return [...new Set([
    ...(selected ? [selected] : []),
    ...(product.imgs ?? []),
    ...(product.choices ?? []).flatMap((choice) => choice.image ? [choice.image] : []),
  ])];
}

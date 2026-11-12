import type { Product } from "./catalog";
import { matchesColorFilter, uniqueColors } from "./colors";
import { matchesSizeFilter, uniqueSizes } from "./sizes";

type VariantFilters = { colors: string[]; sizes: string[]; stock: boolean };

export function categoryProductSelection(product: Product, filters: VariantFilters): { color?: string; size?: string; image?: string } {
  let firstSelection: { color?: string; size?: string } | undefined;
  const candidates = filters.colors.length ? filters.colors : filters.sizes.length ? (product.colors.length ? product.colors : [""]) : [];
  for (const color of candidates) {
    const selectedColors = color ? [color] : [];
    const colorChoices = (product.choices ?? []).filter((choice) => matchesColorFilter([choice.color], selectedColors));
    const matching = colorChoices.filter((choice) =>
      matchesSizeFilter([choice.size], filters.sizes) && (!filters.stock || choice.available),
    );
    if (!matching.length && (product.choices?.length || !matchesColorFilter(product.colors, selectedColors) || !matchesSizeFilter(product.sizes, filters.sizes))) continue;
    const available = matching.filter((choice) => choice.available);
    const preferred = available.length ? available : matching;
    const choice = preferred.find((choice) => choice.image) ?? preferred[0];
    const selection = {
      color: choice?.color || product.colors.find((value) => matchesColorFilter([value], selectedColors)),
      size: filters.sizes.length ? choice?.size ?? product.sizes.find((value) => matchesSizeFilter([value], filters.sizes)) : undefined,
    };
    firstSelection ??= selection;
    // Prefer the exact variant, then another size's photo of the same color.
    const image = choice?.image ?? colorChoices.find((choice) => choice.image)?.image;
    if (image) return { ...selection, image };
  }
  return { ...firstSelection, image: product.imgs?.[0] };
}

export function categoryProductImage(product: Product, filters: VariantFilters): string | undefined {
  return categoryProductSelection(product, filters).image;
}

export function categoryVariantFilters(products: Product[], filters: VariantFilters) {
  const colors: string[] = [];
  const sizes: string[] = [];
  const matches = products.filter((product) => {
    if (product.choices?.length) {
      let matched = false;
      for (const choice of product.choices) {
        if (filters.stock && !choice.available) continue;
        const colorMatches = matchesColorFilter([choice.color], filters.colors);
        const sizeMatches = matchesSizeFilter([choice.size], filters.sizes);
        // Ignore this facet's own selection so multiple choices remain possible.
        if (colorMatches) sizes.push(choice.size);
        if (sizeMatches) colors.push(choice.color);
        if (colorMatches && sizeMatches) matched = true;
      }
      return matched;
    }

    // Legacy catalog entries have product-level options but no variant pairs.
    const colorMatches = matchesColorFilter(product.colors, filters.colors);
    const sizeMatches = matchesSizeFilter(product.sizes, filters.sizes);
    if (colorMatches) sizes.push(...product.sizes);
    if (sizeMatches) colors.push(...product.colors);
    return colorMatches && sizeMatches;
  });

  return { products: matches, colors: uniqueColors(colors), sizes: uniqueSizes(sizes) };
}

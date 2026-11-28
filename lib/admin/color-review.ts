import type { Product } from "../catalog";
import { colorFamilies, familyForColor, type ColorMapping, type ColorMappings } from "../color-families";
import { colorLabel, colorMappingKey, colorNameKey, HEX } from "../colors";

export type ColorReviewExample = { id: string; name: string; image?: string; variant: boolean };
export type ColorReviewItem = {
  key: string;
  label: string;
  count: number;
  example: ColorReviewExample;
  approved?: ColorMapping;
};
export type ColorSuggestion = ColorMapping & { source: "name" | "photo" };

export function catalogColorReview(products: Product[], mappings: ColorMappings = {}): ColorReviewItem[] {
  const rows = new Map<string, ColorReviewItem>();
  for (const product of products) {
    if (product.bundleSourceId) continue;
    const values = new Map<string, { label: string; photo?: string }>();
    const colorsByImage = new Map<string, Set<string>>();
    for (const choice of product.choices ?? []) {
      if (!choice.image) continue;
      const keys = colorsByImage.get(choice.image) ?? new Set<string>();
      keys.add(colorMappingKey(choice.color));
      colorsByImage.set(choice.image, keys);
    }
    for (const choice of product.choices ?? []) {
      const key = colorMappingKey(choice.color);
      const photo = choice.image && colorsByImage.get(choice.image)?.size === 1 ? choice.image : undefined;
      if (key && (!values.has(key) || (photo && !values.get(key)?.photo))) values.set(key, { label: choice.color, photo });
    }
    for (const label of product.colors) {
      const key = colorMappingKey(label);
      if (key && !values.has(key)) values.set(key, { label });
    }
    for (const [key, { label, photo }] of values) {
      if (familyForColor(label)) continue;
      const example = { id: product.id, name: product.name, image: photo ?? product.imgs?.[0], variant: Boolean(photo) };
      const row = rows.get(key);
      if (row) {
        row.count++;
        if (!row.example.image || (example.variant && !row.example.variant)) row.example = example;
      } else {
        const approved = Object.hasOwn(mappings, key) ? mappings[key] : undefined;
        rows.set(key, { key, label: colorLabel(label), count: 1, example, approved });
      }
    }
  }
  return [...rows.values()].sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "he", { numeric: true }));
}

const tokens = (text: string) => colorNameKey(text).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const colorTerms = Object.keys(HEX).map(term => ({ term, words: tokens(term), family: familyForColor(term) }));

export function suggestColorFromName(label: string): ColorSuggestion | undefined {
  const text = ` ${tokens(label)} `;
  const matches = colorTerms.filter(({ words, family }) => words && family && text.includes(` ${words} `));
  // Prefer an explicit shade such as "כחול שחור" over the individual words it contains.
  const specific = matches.filter(match => !matches.some(({ words }) => words !== match.words && ` ${words} `.includes(` ${match.words} `)));
  const families = new Set(specific.map(match => match.family));
  if (families.size !== 1) return undefined;
  const best = specific.sort((left, right) => right.words.length - left.words.length)[0];
  if (!best?.family) return undefined;
  const swatch = HEX[best.term];
  return { family: best.family, swatch: swatch.startsWith("#") ? swatch : colorFamilies[best.family].swatch, source: "name" };
}

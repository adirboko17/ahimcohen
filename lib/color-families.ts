import { colorLabel, colorMappingKey, matchesColorFilter, resolveSwatch, uniqueColors } from "./colors";

export const colorFamilies = {
  black: { label: "שחור", swatch: "#1A1A1A" },
  white: { label: "לבן", swatch: "#FFFFFF" },
  gray: { label: "אפור", swatch: "#8A8B8D" },
  blue: { label: "כחול", swatch: "#2F5597" },
  green: { label: "ירוק", swatch: "#4E6B3A" },
  brown: { label: "חום", swatch: "#6B4A32" },
  beige: { label: "בז׳", swatch: "#D8C8A8" },
  red: { label: "אדום", swatch: "#B23A32" },
  orange: { label: "כתום", swatch: "#E8742A" },
  yellow: { label: "צהוב", swatch: "#E9C23B" },
  pink: { label: "ורוד", swatch: "#E899B6" },
  purple: { label: "סגול", swatch: "#75448E" },
  multicolor: { label: "צבעוני", swatch: "#4E7DB7" },
} as const;

export type ColorFamily = keyof typeof colorFamilies;
export type ColorMapping = { family: ColorFamily; swatch: string };
export type ColorMappings = Readonly<Record<string, ColorMapping>>;
export const emptyColorMappings: ColorMappings = {};
export const colorFamilyIds = Object.keys(colorFamilies) as ColorFamily[];
const familyPrefix = "family:";

const labelsByFamily: Record<ColorFamily, string[]> = {
  black: ["שחור", "שחור מלאנג'"],
  white: ["לבן", "אופוויט", "לבן אבן"],
  gray: ["אפור", "אפור בהיר", "אפור כהה", "אפור פחם", "אפור מלאנז'"],
  blue: ["כחול", "כחול כהה", "נייבי בהיר", "כחול שחור", "רויאל", "תכלת", "ג'ינס", "פטרול"],
  green: ["ירוק", "ירוק כהה", "ירוק בקבוק", "ירוק בית חולים", "ירוק זוהר", "תפוח", "זית", "זית מאובק"],
  brown: ["חום", "ברונזה"],
  beige: ["בז'", "חאקי", "צהוב אבן"],
  red: ["אדום", "בורדו"],
  orange: ["כתום"],
  yellow: ["צהוב"],
  pink: ["ורוד"],
  purple: ["סגול"],
  multicolor: ["פסים שחור לבן", "פסים כחול לבן", "משבצות", "צבעוני"],
};
const builtInFamilies = new Map(colorFamilyIds.flatMap(family => labelsByFamily[family].map(label => [label, family] as const)));

export function isColorFamily(value: string): value is ColorFamily {
  return Object.hasOwn(colorFamilies, value);
}

export function colorFamilyFilter(value: string): ColorFamily | undefined {
  if (!value.startsWith(familyPrefix)) return undefined;
  const family = value.slice(familyPrefix.length);
  return isColorFamily(family) ? family : undefined;
}

export function categoryColorLabel(value: string) {
  const family = colorFamilyFilter(value);
  return family ? colorFamilies[family].label : colorLabel(value);
}

export function familyForColor(color: string, mappings: ColorMappings = emptyColorMappings): ColorFamily | undefined {
  const label = colorLabel(color);
  const family = builtInFamilies.get(label);
  if (family) return family;
  if (resolveSwatch(color, false)) return "multicolor";
  const key = colorMappingKey(color);
  return Object.hasOwn(mappings, key) ? mappings[key].family : undefined;
}

export function categoryColorValue(color: string, mappings: ColorMappings): string {
  const family = colorFamilyFilter(color) ?? familyForColor(color, mappings);
  return family ? familyPrefix + family : colorLabel(color);
}

export function categoryColorOptions(colors: string[], mappings: ColorMappings) {
  const families = new Set<ColorFamily>();
  const additional: string[] = [];
  for (const color of uniqueColors(colors)) {
    const family = colorFamilyFilter(color) ?? familyForColor(color, mappings);
    if (family) families.add(family);
    else additional.push(color);
  }
  return {
    families: colorFamilyIds.filter(family => families.has(family)).map(family => ({ ...colorFamilies[family], value: familyPrefix + family,
      ...(family === "multicolor" && { swatch: resolveSwatch("צבעוני") ?? colorFamilies.multicolor.swatch }),
    })),
    additional: additional.sort((left, right) => left.localeCompare(right, "he", { numeric: true })),
  };
}

export function categoryColorMatcher(selected: string[], mappings: ColorMappings = emptyColorMappings) {
  if (!selected.length) return (_colors: string[]) => true;
  const families = new Set(selected.map(colorFamilyFilter).filter(family => family !== undefined));
  const exact = selected.filter(color => !colorFamilyFilter(color));
  return (colors: string[]) => colors.some(color => {
    const family = families.size ? familyForColor(color, mappings) : undefined;
    return (!!family && families.has(family)) || (!!exact.length && matchesColorFilter([color], exact));
  });
}

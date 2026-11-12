// Normalize presentation/filtering only. Shopify variant values stay unchanged.
function readableColor(value: string): string {
  let label = value.trim();
  try {
    label = decodeURIComponent(label);
  } catch {
    // A literal or malformed percent sign must not break the product page.
  }
  return label.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "").replace(/\s+/g, " ").trim();
}

function colorKey(value: string): string {
  return readableColor(value).normalize("NFKC").toLowerCase()
    .replace(/['"׳״‘’“”`]/g, "")
    .replace(/[-–—־_]/g, " ")
    .replace(/\s+/g, " ").trim();
}

const definitions: [string, string[]][] = [
  ["#FFFFFF", ["לבן", "white"]],
  ["#1A1A1A", ["שחור", "black"]],
  ["#8A8B8D", ["אפור", "אפור עכבר", "אפ עכבר", "gray", "grey", "mouse gray", "mouse grey"]],
  ["#C5C6C7", ["אפור בהיר", "light gray", "light grey"]],
  ["#55585C", ["אפור כהה", "dark gray", "dark grey"]],
  ["#3C3F42", ["אפור פחם", "צ'רקול", "צרקול", "charcoal", "shadow"]],
  ["#1F2A44", ["כחול כהה", "נייבי", "navy", "navy blue", "dark blue"]],
  ["#435A78", ["נייבי בהיר", "light navy"]],
  ["#151E2D", ["כחול שחור", "בלו בלק", "blue black"]],
  ["#2F5597", ["כחול", "blue"]],
  ["#2849A8", ["רויאל", "כחול רויאל", "royal", "royal blue"]],
  ["#8DC6E8", ["תכלת", "light blue", "sky blue"]],
  ["#4E6E8E", ["ג'ינס", "denim"]],
  ["#22636A", ["פטרול", "petrol", "teal"]],
  ["#4E6B3A", ["ירוק", "green"]],
  ["#2F4A36", ["ירוק כהה", "dark green"]],
  ["#1E4D3A", ["ירוק בקבוק", "ירוק בק", "bottle green"]],
  ["#8EC9B1", ["ירוק בית חולים", "ירוק ב\"ח", "hospital green"]],
  ["#B7E333", ["ירוק זוהר", "hi vis green", "lime"]],
  ["#8DBD42", ["תפוח", "ירוק תפוח", "apple green"]],
  ["#6B6B3E", ["זית", "olive"]],
  ["#85856B", ["זית מאובק", "dusty olive"]],
  ["#B4A17A", ["חאקי", "khaki"]],
  ["#D8C8A8", ["בז'", "בז", "בז׳", "beige"]],
  ["#DCCB9E", ["צהוב אבן", "yellow stone"]],
  ["#F3F0E6", ["אופוויט", "אוף וויט", "off white", "ivory"]],
  ["#E5DFD0", ["לבן אבן", "stone"]],
  ["#6B4A32", ["חום", "brown"]],
  ["#8C6A3F", ["ברונזה", "bronze"]],
  ["#B23A32", ["אדום", "red"]],
  ["#75283F", ["בורדו", "burgundy", "maroon"]],
  ["#E899B6", ["ורוד", "pink"]],
  ["#75448E", ["סגול", "purple"]],
  ["#E9C23B", ["צהוב", "yellow"]],
  ["#E8742A", ["כתום", "orange"]],
  ["repeating-linear-gradient(35deg, #B9B7B2 0 2px, #D0CFCC 2px 3px)", ["אפור מלאנז'", "מלאנז'", "מלאנג'", "אפור מלאנג'", "heather gray", "grey melange"]],
  ["repeating-linear-gradient(35deg, #363638 0 2px, #6B6B6E 2px 3px)", ["שחור מלאנג'", "שחור מלאנז'", "black melange"]],
  ["repeating-linear-gradient(90deg, #1A1A1A 0 3px, #FFFFFF 3px 6px)", ["פסים שחור לבן", "פסים"]],
  ["repeating-linear-gradient(90deg, #2F5597 0 3px, #FFFFFF 3px 6px)", ["פסים כחול לבן"]],
  ["repeating-conic-gradient(#222222 0% 25%, #FFFFFF 0% 50%) 0 0 / 8px 8px", ["משבצות", "checkered", "checked"]],
  ["conic-gradient(#D75249 0deg 90deg, #F0CD50 90deg 180deg, #5A9B69 180deg 270deg, #4E7DB7 270deg)", ["צבעוני", "פירות", "multicolor", "multi colour"]],
];

export const HEX: Record<string, string> = Object.fromEntries(
  definitions.flatMap(([background, names]) => names.map(name => [colorKey(name), background])),
);

// The first alias in each definition is the canonical Hebrew display name.
const hebrewLabels = new Map(definitions.flatMap(([, names]) => names.map((name) => [colorKey(name), names[0]] as const)));

export function colorLabel(value: string): string {
  const direct = hebrewLabels.get(colorKey(value));
  if (direct) return direct;
  const label = readableColor(value);
  const parts = label.split(/\s*[/+&]\s*/);
  if (parts.length > 1) return parts.map((part) => hebrewLabels.get(colorKey(part)) ?? part).join(" / ");
  // Preserve unknown labels rather than assigning them to an unrelated color.
  return label;
}

function colorIdentity(value: string): string {
  return colorLabel(value).split(/\s*[/+&]\s*/).map(colorKey).sort().join("/");
}

export function uniqueColors(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = colorIdentity(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(colorLabel(value));
  }
  return result;
}

export function matchesColorFilter(productColors: string[], selectedColors: string[]): boolean {
  if (!selectedColors.length) return true;
  const selected = new Set(selectedColors.map(colorIdentity));
  return productColors.some((color) => selected.has(colorIdentity(color)));
}

export function resolveSwatch(name: string): string | null {
  const key = colorKey(name);
  if (Object.hasOwn(HEX, key)) return HEX[key];
  const parts = key.split(/\s*[/+&]\s*/);
  if (parts.length > 1 && parts.every(part => Object.hasOwn(HEX, part) && HEX[part].startsWith("#"))) {
    const stops = parts.map((part, index) => `${HEX[part]} ${index * 100 / parts.length}% ${(index + 1) * 100 / parts.length}%`);
    return `linear-gradient(135deg, ${stops.join(", ")})`;
  }
  return null;
}

// An unmapped label gets a neutral pattern, never an invented color.
export const UNKNOWN_SWATCH = "repeating-linear-gradient(135deg, #FFFFFF 0 5px, #C8C8C8 5px 7px)";
export function swatchColor(name: string): string {
  return resolveSwatch(name) ?? UNKNOWN_SWATCH;
}

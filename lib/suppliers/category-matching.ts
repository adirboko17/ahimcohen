import { categoryFilterLabel, legacyWorkFootwearCategoryName, outdoorFootwear } from "@/lib/category-placement";

export function categoryText(value?: string | null) {
  return (value ?? "").toLowerCase().normalize("NFKD").replace(/[\p{M}'׳״’]/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

const aliases: Record<string, string[]> = {
  [outdoorFootwear.parent]: [legacyWorkFootwearCategoryName, "הנעלה", "נעליים והנעלה", "נעלי עבודה", "נעלים", "footwear", "shoes"],
  "נעלי בטיחות": ["נעל בטיחות", "נעלי עבודה עם מגן", "safety shoes", "safety shoe"],
  "נעלי עבודה ללא מגן": ["נעל עבודה ללא מגן", "נעל בלי מגן", "soft toe shoes", "soft toe"],
  "מגפי עבודה ובטיחות": ["מגף בטיחות", "מגפי בטיחות", "מגפי עבודה", "מגף עבודה", "safety boots", "work boots"],
  "אביזרי הנעלה ורפידות": ["אביזרי הנעלה", "רפידה", "רפידות", "שרוכים", "שרוכי נעליים", "insoles"],
  [outdoorFootwear.sub]: ["סניקרס", "נעלי טיולים", "נעל טיולים", "מגפי טיולים", "נעלי טיפוס הרים", "sneaker", "sneakers", "hiking shoes", "hiking boots", "trekking shoes", "trekking boots"],
  "גרביים": ["גרב", "גרבי", "גרבים", "גרב תרמית", "socks", "sock"],
  "חגורות": ["חגורת", "חגורה", "belts", "belt"],
  "חולצות": ["חולצת", "חולצה", "חולצות טי", "חולצת טי", "חולצת פולו", "חולצות פולו", "טישירט", "טי שירט", "t shirt", "polo shirt", "shirt"],
  "מכנסיים": ["מכנסי עבודה", "מכנס עבודה", "מכנסיים מקצועיים", "דגמח", "pants", "trousers"],
  "מקטורונים | טוניקות": ["מקטורן", "מקטורונים", "טוניקה", "טוניקות", "מקטרונים וחלוקים"],
  "כפפות עבודה": ["כפפת עבודה", "כפפות מגן", "כפפות", "הגנת ידיים", "work gloves", "safety gloves"],
  "הגנת ראייה ופנים": ["הגנת עיניים ופנים", "משקף מגן", "משקפי מגן", "משקפי בטיחות", "safety glasses", "face shield"],
  "הגנת ראש": ["קסדת בטיחות", "קסדות בטיחות", "hard hat", "safety helmet"],
  "ציוד לעבודה בגובה": ["עבודה בגובה", "רתמת גוף", "רתמת בטיחות", "fall protection"],
  "ביגוד תרמי": ["חולצה תרמית", "חולצת תרמית", "מכנס תרמי", "thermal shirt", "thermal underwear", "thermal base layer"],
  "חולצות ארוכות": ["חולצה ארוכה", "חולצת פליז", "טישירט שרוול ארוך", "טי שירט שרוול ארוך", "חולצת שרוול ארוך", "long sleeve shirt", "long sleeve"],
  "חליפות גשם": ["חליפת גשם", "rain suit"],
  "אפודים זוהרים": ["אפוד זוהר", "hi vis vest", "high visibility vest"],
  "מעילים": ["מעיל", "jacket"],
  "סווטשירטים וקפוצ'ונים": ["קפוצון", "סווטשירט", "hoodie", "sweatshirt"],
  "סרבלים": ["סרבל", "coveralls"],
  "סינרים": ["סינר", "apron"],
  "ג'קט שף": ["מעיל שף", "חולצת שף", "chef jacket", "chef coat"],
  "מטבח ומזון": ["מטבח ומסעדנות", "מסעדנות"],
  "מוצרי בטיחות": ["בטיחות ומיגון אישי", "ציוד מגן אישי", "מיגון אישי"],
  "נעלי ריצה כביש": ["נעלי ריצת כביש", "נעל ריצה לכביש", "road running shoes"],
  "נעלי ריצה שטח": ["נעלי ריצת שטח", "נעל ריצה לשטח", "trail running shoes"],
  "אוהלים": ["אוהל", "tent", "tents"],
  "ערסלים": ["ערסל", "hammock", "hammocks"],
};

const broad = /^(?:all(?: products)?|shop(?: all)?|home|catalogu?e|default|uncategorized|unclassified|featured|best sellers|sale|clearance|outlet|new arrivals|mens?|womens?|כל המוצרים|כל מוצרי האתר(?: .*)?|כללי|חנות|קטלוג|ללא קטגוריה|(?:כל )?מותגים|מבצע(?:ים)?(?: .*)?|הנחות(?: .*)?|סייל(?: .*)?|חדש(?:ים)?|מומלצים|גברים|נשים|(?:ביגוד|נעלי(?:ים)?|הנעלה) (?:גברים|נשים|ילדים)|ביגוד)$/;
const internal = /^(?:siblings?(?:\b|$)|(?:(?:ids?|skus?|variant|test|internal|collection|group)\b(?: (?:[a-z]|[a-z0-9]*\d[a-z0-9]*))*|\d+|[a-z]\d+[a-z0-9]*)$)/;

export function technicalSupplierCategory(name: string, handle?: string) {
  return internal.test(categoryText(name)) || internal.test(categoryText(handle));
}

export function supplierCategoryLabel(name: string, handle?: string, brand?: string) {
  const clean = categoryFilterLabel(name);
  const key = categoryText(clean);
  const brandKey = categoryText(brand);
  if (key.length < 3 || technicalSupplierCategory(clean, handle) || broad.test(key) ||
    /(?:^| )(?:לא לגעת|לא לעלות|ללא הנחות|איסוף והחלפה)(?: |$)/.test(key) ||
    (brandKey && (key === brandKey || key === brandKey + " outlet"))) return "";
  return clean;
}

export function categoryNames(label: string) {
  return [label, ...(aliases[label] ?? [])].map(categoryText).filter(Boolean);
}

const canonicalByAlias = new Map(Object.keys(aliases).flatMap(label => categoryNames(label).map(name => [name, label] as const)));
export function canonicalCategoryLabel(label: string) {
  const clean = categoryFilterLabel(label);
  return canonicalByAlias.get(categoryText(clean)) ?? clean;
}

export function sourceMappingSuggestion(label: string, collections: {
  id: string; paths: { parent: string; sub: string }[];
}[]) {
  const key = categoryText(label);
  if (!key || canonicalCategoryLabel(label) === outdoorFootwear.sub) return [];
  const matches = collections.filter(collection => collection.paths.some(path => categoryNames(path.sub || path.parent).includes(key)));
  return matches.length === 1 ? [matches[0].id] : [];
}

export function categoryPhrase(text: string, phrase: string) {
  return !!phrase && ` ${text} `.includes(` ${phrase} `);
}

export function isOutdoorFootwear(product: { title: string; productType?: string | null; description?: string[] | null; attributes?: { name: string; values: string[] }[] | null }) {
  const identity = categoryText((product.title ?? "") + " " + (product.productType ?? ""));
  if (/(?:^| )(?:גרב\p{L}*|שרוכ\p{L}*|רפיד\p{L}*|כפכפ\p{L}*|סנדל\p{L}*|משחת|socks?|laces?|insoles?|sandals?|slides?)(?: |$)/u.test(identity)) return false;
  if (!/(?:^| )(?:סניקר\p{L}*|sneakers?)(?: |$)|(?:נעל\p{L}*|מג[פף]\p{L}*) (?:טיול\p{L}*|טרק\p{L}*|טיפוס הרים)|\b(?:hiking|trekking|approach) (?:shoes?|boots?)\b/u.test(identity)) return false;
  const facts = categoryText([identity, ...(product.description ?? []).slice(0, 8),
    ...(product.attributes ?? []).flatMap(attribute => attribute.values)].join(" "))
    .replace(/(?:ללא|בלי) כיפת מגן/g, "");
  return !/(?:^| )(?:s[1-7](?:p|pl|ps|l|s)?|sb)(?: |$)|\ben iso 2034[57]\b|כיפת מגן|\bsafety (?:shoes?|boots?|sneakers?)\b/u.test(facts) &&
    !/(?:נעל\p{L}*|מג[פף]\p{L}*|סניקר\p{L}*) (?:עבודה|בטיחות)/u.test(identity);
}

export function outdoorFootwearPath(path: { parentId: string; sub: string }) {
  return path.parentId === outdoorFootwear.id && canonicalCategoryLabel(path.sub) === outdoorFootwear.sub;
}

export function outdoorFootwearCollection(collections: {
  id: string; manual: boolean; published: boolean; paths: { parentId: string; sub: string }[];
}[]) {
  return collections.find(collection => collection.manual && collection.published && collection.paths.some(outdoorFootwearPath))?.id;
}

export function productSupportsCategory(label: string, title: string, productType?: string | null) {
  const stem = (value: string) => categoryText(value).replace(/\b(running|run)\b/g, "running")
    .replace(/(^| )מגני(?= |$)/g, "$1מגן").replace(/(^| )נעל(?:ים|יים|י)?(?= |$)/g, "$1נעל")
    .replace(/(^| )ריצת(?= |$)/g, "$1ריצה");
  return [label, ...(aliases[label] ?? [])].some(name => {
    const term = stem(name);
    return !!term && (term === stem(productType ?? "") || categoryPhrase(stem(title), term));
  });
}

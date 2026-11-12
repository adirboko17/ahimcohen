import type { Product } from "./catalog";

type AccessoryKind = "socks" | "insole" | "belt" | "cap" | "beanie" | "neckwarmer" | "tie" | "chef-hat" | "apron";

function normalize(value: string) {
  return value.toLowerCase().replace(/[׳״'"`]/g, "").replace(/\s+/g, " ").trim();
}

function hasSub(product: Product, pattern: RegExp) {
  return [product.sub, ...(product.subs ?? [])].some((sub) => pattern.test(normalize(sub)));
}

function inCategory(product: Product, category: string) {
  return product.cat === category || product.cats?.includes(category);
}

function isMainGarment(product: Product) {
  return hasSub(product, /^(נעלי |מגפי |מכנס|חולצות|מעילים|חליפות|סווטשירט|גקט|מקטור|מקטר|סרבלים|חרמוניות|ביגוד תרמי|אפודים)/);
}

function accessoryKind(product: Product): AccessoryKind | null {
  // A coat "with a hat" and boots "with an insole" are not accessories.
  if (isMainGarment(product)) return null;
  const name = normalize(product.name);
  if (/(?:^|\s)(?:מעיל|מגף|מגפיים|מכנסי|מכנסיים|חולצת)\s|\b(?:jacket|trousers|boots|shirt)\b/.test(name)) return null;
  // Don't infer compatibility for safety components, weapon/tool belts or
  // replacement parts intended for a particular shoe model.
  if (inCategory(product, "safety") || inCategory(product, "disp")) return null;
  if (/בטיחות|נשק|קשירה|תפסן|רתמ|ריתמ|לכלי|חגורת גב|תמיכה|הרמה|מגן|קוולאר|החלקה|בירקי|birki/.test(name)) return null;

  if (hasSub(product, /^גרביים$/) || /(?:^|\s|\/)גרב(?:יים|ים|י|ית)?(?:\s|$)|\bsocks?\b/.test(name)) return "socks";
  if ((hasSub(product, /^חגורות$/) || /חגור(?:ה|ת)|\bbelts?\b/.test(name)) && !/זוהר|מחזיר אור|reflective/.test(name)) return "belt";
  if ((inCategory(product, "shoes") && /רפיד(?:ה|ת|ות)/.test(name)) || /מדרס|\binsoles?\b/.test(name)) return "insole";
  if (hasSub(product, /^כובעי שף$/) || /כובע.*(?:שף|טבח)|\bchef.*hat\b/.test(name)) return "chef-hat";
  if (hasSub(product, /^סינרים$/) && inCategory(product, "kitchen")) return "apron";
  if (/חם צו(?:א|וא)ר|מחמם צוואר|\bneck\s*(?:warmer|gaiter)\b/.test(name)) return "neckwarmer";
  if (/כובע.*(?:צמר|פליז|סרוג|חורף)|\b(?:beanie|knit hat)\b/.test(name)) return "beanie";
  if (/כובע.*מצחי|\b(?:baseball|trucker) cap\b/.test(name)) return "cap";
  if (/עניב(?:ה|ת)|\b(?:necktie|bow tie)\b/.test(name)) return "tie";
  return null;
}

function complementaryKinds(product: Product): AccessoryKind[] {
  if (accessoryKind(product)) return [];
  if (inCategory(product, "safety") || inCategory(product, "disp")) return [];
  const name = normalize(product.name);

  if (inCategory(product, "shoes") && !hasSub(product, /אביזרי הנעלה/)) return ["insole", "socks"];
  if (inCategory(product, "kitchen") && hasSub(product, /^(גקט שף|מכנסי שף)/)) return ["chef-hat", "apron"];
  if (hasSub(product, /^מכנס/) && !/טייץ|לגינג|טרנינג|\b(?:legging|jogger|sweatpant)/.test(name)) return ["belt"];
  if (inCategory(product, "winter") && hasSub(product, /^(מעילים|סווטשירטים|חרמוניות|ביגוד תרמי)/)) return ["beanie", "neckwarmer"];
  if (inCategory(product, "rep") && hasSub(product, /^חולצות/) && /מכופתר|אוקספורד|אלגנט|\b(?:oxford|dress shirt)\b/.test(name)) return ["tie"];
  if (inCategory(product, "pro") && hasSub(product, /^חולצות$/)) return ["cap"];
  // An unknown product gets no suggestions instead of unrelated fallback items.
  return [];
}

function brand(value: string | undefined) {
  const normalized = normalize(value ?? "").replace(/\.co\.il$/, "");
  // The supplier/store name is not evidence of a matching manufacturer.
  return /^(worker|ahim|האחים)/.test(normalized) ? "" : normalized;
}

// These collections contain different kinds of items, so membership alone
// cannot establish similarity. Recognized accessories use their specific kind.
const BROAD_SUBCATEGORIES = new Set([
  "אקססוריז", "אביזרים נלווים", "אביזרים למטבח", "אביזרי הנעלה ורפידות",
  "אביזרים חד פעמי", "ביגוד מקצועי חד פעמי", "ציוד בטיחות נלווה",
  "מוצרי ניקיון", "מבצעים", "מומלצים", "חדש",
]);

function similarityKeys(product: Product): string[] {
  const accessory = accessoryKind(product);
  if (accessory) return [`accessory:${accessory}`];
  return [...new Set([product.sub, ...(product.subs ?? [])].map(normalize))]
    .filter((sub) => sub && !BROAD_SUBCATEGORIES.has(sub))
    .map((sub) => `subcategory:${sub}`);
}

export function similarProducts(product: Product, catalog: Product[], limit = 4): Product[] {
  if (!Number.isInteger(limit) || limit <= 0) return [];
  const keys = new Set(similarityKeys(product));
  if (!keys.size) return [];
  const wantedBrand = brand(product.brand);
  const candidates = catalog.filter((candidate) =>
    candidate.id !== product.id &&
    (!candidate.choices?.length || candidate.choices.some((choice) => choice.available)) &&
    similarityKeys(candidate).some((key) => keys.has(key)),
  );
  candidates.sort((a, b) => {
    const sameSub = (item: Product) => !!product.sub && normalize(item.sub) === normalize(product.sub);
    const sameBrand = (item: Product) => !!wantedBrand && brand(item.brand) === wantedBrand;
    return Number(sameSub(b)) - Number(sameSub(a)) ||
      Number(sameBrand(b)) - Number(sameBrand(a)) ||
      Math.abs(a.price - product.price) - Math.abs(b.price - product.price) ||
      a.id.localeCompare(b.id);
  });
  const identity = (item: Product) => JSON.stringify([normalize(item.name), brand(item.brand)]);
  const seenIds = new Set([product.id]);
  const seenProducts = new Set([identity(product)]);
  const result: Product[] = [];
  for (const candidate of candidates) {
    const name = identity(candidate);
    if (seenIds.has(candidate.id) || seenProducts.has(name)) continue;
    seenIds.add(candidate.id);
    seenProducts.add(name);
    result.push(candidate);
    if (result.length === limit) break;
  }
  return result;
}

export function complementaryAccessories(product: Product, catalog: Product[], limit = 4): Product[] {
  if (!Number.isInteger(limit) || limit <= 0) return [];
  const kinds = complementaryKinds(product);
  if (!kinds.length) return [];
  const groups = new Map(kinds.map((kind) => [kind, [] as Product[]]));
  const seen = new Set([product.id]);
  const seenProducts = new Set<string>();
  for (const candidate of catalog) {
    if (seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    if (candidate.choices?.length && !candidate.choices.some((choice) => choice.available)) continue;
    const kind = accessoryKind(candidate);
    const group = kind ? groups.get(kind) : undefined;
    if (!group) continue;
    const identity = JSON.stringify([normalize(candidate.name), brand(candidate.brand)]);
    if (seenProducts.has(identity)) continue;
    seenProducts.add(identity);
    group.push(candidate);
  }
  const wantedBrand = brand(product.brand);
  for (const candidates of groups.values()) {
    candidates.sort((a, b) => {
      const aMatches = !!wantedBrand && brand(a.brand) === wantedBrand;
      const bMatches = !!wantedBrand && brand(b.brand) === wantedBrand;
      return Number(bMatches) - Number(aMatches) || a.id.localeCompare(b.id);
    });
  }
  // Alternate accessory types so shoes don't get four nearly identical socks
  // when suitable insoles are also available.
  const result: Product[] = [];
  for (let index = 0; result.length < limit; index++) {
    let added = false;
    for (const candidates of groups.values()) {
      if (candidates[index]) {
        result.push(candidates[index]);
        added = true;
        if (result.length === limit) break;
      }
    }
    if (!added) break;
  }
  return result;
}

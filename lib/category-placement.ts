import type { Category } from "./catalog";

export const legacyOutdoorFootwearCategoryId = "outdoor-footwear";
export const legacyWorkFootwearCategoryName = "נעלי עבודה ובטיחות";

export const outdoorFootwear = {
  id: "shoes",
  parent: "נעליים",
  sub: "סניקרס ונעלי טיולים",
} as const;

export const winterOuterwear = {
  parentId: "winter",
  sub: "מעילים וסווטשירטים",
  previous: ["מעילים", "סווטשירטים וקפוצ'ונים"],
} as const;

export const bagsAndWallets = {
  parentId: "acc",
  sub: "תיקים וארנקים",
  previous: ["תיקים"],
} as const;

export const socksAndUnderwear = {
  parentId: "acc",
  sub: "גרביים והלבשה תחתונה",
  previous: ["גרביים", "הלבשה תחתונה"],
} as const;

export const workCoatsAndRobes = {
  parentId: "pro",
  sub: "מקטורנים וחלוקים",
  previous: ["מקטורונים | טוניקות", "מקטרונים וחלוקים"],
} as const;

export const reflectiveVests = { previousParent: "pro", parentId: "safety", sub: "אפודים זוהרים" } as const;
export const workShorts = "מכנסיים קצרים";

export function storefrontSubcategoryParent(parentId: string, sub: string) {
  return parentId === reflectiveVests.previousParent && sub === reflectiveVests.sub ? reflectiveVests.parentId : parentId;
}

const subcategoryChanges = [winterOuterwear, bagsAndWallets, socksAndUnderwear, workCoatsAndRobes];

export function hasStorefrontSubcategoryChanges(parentId: string) {
  return parentId === reflectiveVests.previousParent || subcategoryChanges.some(change => change.parentId === parentId);
}

export function storefrontSubcategory(parentId: string, sub: string) {
  const change = subcategoryChanges.find(change => change.parentId === parentId && change.previous.some(label => label === sub));
  return change?.sub ?? sub;
}

export function storefrontSubcategoryLabelsFor(parentId: string, sub: string) {
  const current = storefrontSubcategory(parentId, sub);
  const previous = subcategoryChanges.find(change => change.parentId === parentId && change.sub === current)?.previous ?? [];
  return [current, ...previous];
}

export type CategoryPlacement = { collectionId: string; parentId: string; label: string; parentName?: string };
export type StorefrontCategoryChoice = { id: string; parentId: string; parent: string; sub: string };

export function storefrontCategoryPlacements(placements: CategoryPlacement[] = []) {
  return placements.map(placement => placement.parentId === legacyOutdoorFootwearCategoryId
    ? { collectionId: placement.collectionId, parentId: outdoorFootwear.id, label: placement.label }
    : { ...placement, parentId: storefrontSubcategoryParent(placement.parentId, placement.label) });
}

export function storefrontCategoryLabels(collections: { id: string; paths: { parent: string; sub: string }[] }[], ids: string[]) {
  const selected = new Set(ids);
  return [...new Set(collections.filter(collection => selected.has(collection.id)).flatMap(collection =>
    collection.paths.map(({ parent, sub }) => sub ? parent + " / " + sub : parent),
  ))];
}

export function storefrontCategories(base: Category[], placements: CategoryPlacement[] = []) {
  const categories = new Map(base.map(category => [category.id, { ...category,
    subs: [...new Set(category.subs.map(sub => storefrontSubcategory(category.id, sub)))],
  }]));
  const current = storefrontCategoryPlacements(placements);
  for (const { parentId, parentName } of current) {
    if (parentName && !categories.has(parentId)) categories.set(parentId, { id: parentId, name: parentName, subs: [] });
  }
  for (const { parentId, label } of current) {
    const category = categories.get(parentId);
    const sub = storefrontSubcategory(parentId, label);
    if (category && sub && !category.subs.includes(sub)) category.subs.push(sub);
  }
  return [...categories.values()];
}

const discountSuffix = /(?:\s|[-–—|·(])+(?:(?:up\s*to|עד|sale|מבצע)\s*[-–—:]?\s*\d{1,3}\s*%\s*(?:off|הנחה)?|\d{1,3}\s*%\s*(?:off|הנחה))[\s!.()]*$/iu;

export function categoryFilterLabel(title: string) {
  return title.trim().replace(discountSuffix, "").replace(/[\s|·:–—-]+$/, "").replace(/\s+/g, " ").trim();
}

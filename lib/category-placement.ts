import type { Category } from "./catalog";

export const legacyOutdoorFootwearCategoryId = "outdoor-footwear";
export const legacyWorkFootwearCategoryName = "נעלי עבודה ובטיחות";

export const outdoorFootwear = {
  id: "shoes",
  parent: "נעליים",
  sub: "סניקרס ונעלי טיולים",
} as const;

export const workCoatsAndRobes = {
  parentId: "pro",
  sub: "מקטורנים וחלוקים",
  previous: ["מקטורונים | טוניקות", "מקטרונים וחלוקים"],
} as const;

export type CategoryPlacement = { collectionId: string; parentId: string; label: string; parentName?: string };
export type StorefrontCategoryChoice = { id: string; parentId: string; parent: string; sub: string };

export function storefrontCategoryPlacements(placements: CategoryPlacement[] = []) {
  return placements.map(placement => placement.parentId === legacyOutdoorFootwearCategoryId
    ? { collectionId: placement.collectionId, parentId: outdoorFootwear.id, label: placement.label }
    : placement);
}

export function storefrontCategoryLabels(collections: { id: string; paths: { parent: string; sub: string }[] }[], ids: string[]) {
  const selected = new Set(ids);
  return [...new Set(collections.filter(collection => selected.has(collection.id)).flatMap(collection =>
    collection.paths.map(({ parent, sub }) => sub ? parent + " / " + sub : parent),
  ))];
}

export function storefrontCategories(base: Category[], placements: CategoryPlacement[] = []) {
  const categories = new Map(base.map(category => [category.id, { ...category, subs: [...category.subs] }]));
  const current = storefrontCategoryPlacements(placements);
  for (const { parentId, parentName } of current) {
    if (parentName && !categories.has(parentId)) categories.set(parentId, { id: parentId, name: parentName, subs: [] });
  }
  for (const { parentId, label } of current) {
    const category = categories.get(parentId);
    if (category && label && !category.subs.includes(label)) category.subs.push(label);
  }
  return [...categories.values()];
}

const discountSuffix = /(?:\s|[-–—|·(])+(?:(?:up\s*to|עד|sale|מבצע)\s*[-–—:]?\s*\d{1,3}\s*%\s*(?:off|הנחה)?|\d{1,3}\s*%\s*(?:off|הנחה))[\s!.()]*$/iu;

export function categoryFilterLabel(title: string) {
  return title.trim().replace(discountSuffix, "").replace(/[\s|·:–—-]+$/, "").replace(/\s+/g, " ").trim();
}

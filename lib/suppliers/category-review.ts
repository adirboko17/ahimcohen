import "server-only";
import { createHash } from "node:crypto";
import { CATS } from "@/lib/catalog";
import { categoryFilterLabel, outdoorFootwear, storefrontCategoryLabels, type StorefrontCategoryChoice } from "@/lib/category-placement";
import { categoryOpportunityMinimum, readSupplierCategoryAudit } from "./category-audit";
import { categoryPath, mappedCollections, supplierKey, type Site } from "./catalog-model";
import { canonicalCategoryLabel, categoryNames, categoryPhrase, categoryText as normalized, isOutdoorFootwear, outdoorFootwearCollection, outdoorFootwearPath, productSupportsCategory, supplierCategoryLabel } from "./category-matching";
import type { SupplierProduct } from "./redback";
import { supplierCollectionMemberships } from "./shopify";
import { supplierStorefrontCollections, type SupplierCollectionOption } from "./storefront-collections";
import { shopFilter, supplierRequest } from "./storage";

type ReviewProduct = Pick<SupplierProduct, "title" | "category" | "description" | "productType" | "brand" | "attributes">;
type ScannedProduct = {
  source_id: string;
  category_ids: string[];
  shopify_product_id: string | null;
  snapshot: ReviewProduct;
};
type ScannedProductFields = Omit<ScannedProduct, "snapshot"> & ReviewProduct & {
  image: string | null;
  revision: string;
  collection_ids: string[];
};
type Destination = {
  id: string;
  title: string;
  parent: string;
  parentId: string;
  sub: string;
  names: string[];
  manual: boolean;
  collectionIds: string[];
};
type Source = { id: string; name: string; path: string[]; label: string };
export type SupplierCategoryChoice = StorefrontCategoryChoice;
export type SupplierCategoryReviewProduct = {
  id: string;
  title: string;
  shopifyId: string | null;
  current: string[] | null;
  image?: string;
  revision: string;
  recommendation?: SupplierCategoryChoice;
  proposedCategory?: string;
};
type Suggestion = {
  kind: "existing" | "change" | "new" | "place" | "review";
  source: Source;
  sources: Source[];
  title: string;
  parent?: string;
  reason: string;
  targetIds: string[];
  productGroup?: boolean;
  products: SupplierCategoryReviewProduct[];
};

type Proposed = Omit<Suggestion, "products" | "sources">;
const catalogNames = new Set(CATS.flatMap(c => [c.name, ...c.subs]).flatMap(categoryNames));
const emptySource: Source = { id: "", name: "", path: [], label: "" };

function sourcesFor(row: ScannedProduct, site: Site) {
  const paths = row.category_ids.map(id => categoryPath(id, site.categories)).filter(path => path.length);
  const parents = new Set(paths.flatMap(path => path.slice(0, -1).map(category => category.id)));
  const leaves = paths.flatMap(path => {
    const leaf = path.at(-1)!;
    return parents.has(leaf.id) ? [] : [{ id: leaf.id, name: leaf.name, handle: leaf.handle, path: path.slice(0, -1).map(c => c.name) }];
  });
  const labels = leaves.length ? leaves : (row.snapshot.category ?? "").split("·").map(name => ({ id: "", name: name.trim(), path: [], handle: undefined }));
  return labels.flatMap(({ name, handle, ...source }) => {
    const label = supplierCategoryLabel(name, handle, row.snapshot.brand);
    return label ? [{ ...source, name, label }] : [];
  });
}

function destinationsFor(collections: SupplierCollectionOption[]) {
  const paths = new Map<string, Destination>();
  for (const collection of collections) for (const path of collection.paths) {
    const title = path.sub || path.parent;
    const key = JSON.stringify([path.parentId, normalized(title)]);
    const previous = paths.get(key);
    if (previous) {
      previous.collectionIds.push(collection.id);
      if (collection.manual && !previous.manual) {
        previous.id = collection.id;
        previous.manual = true;
      }
    } else paths.set(key, { ...path, id: collection.id, title, manual: collection.manual,
      names: categoryNames(title), collectionIds: [collection.id] });
  }
  return [...paths.values()];
}

export function storefrontCategoryChoices(collections: SupplierCollectionOption[]): SupplierCategoryChoice[] {
  return destinationsFor(collections.filter(collection => collection.manual && collection.published))
    .map(({ id, parentId, parent, sub }) => ({ id, parentId, parent, sub }))
    .sort((a, b) => a.parent.localeCompare(b.parent, "he") || a.sub.localeCompare(b.sub, "he"));
}

function rankDestinations(product: ReviewProduct, sources: Source[], destinations: Destination[]) {
  const title = normalized(product.title);
  const description = normalized((product.description ?? []).join(" ").slice(0, 2400));
  const types = [product.productType, ...(product.attributes ?? [])
    .filter(a => /^(סוג מוצר|סוג פריט|product type|item type)$/i.test(a.name.trim())).flatMap(a => a.values)]
    .map(normalized).filter(Boolean);
  const labels = sources.map(s => normalized(s.label));
  return destinations.map(destination => {
    let score = 0;
    for (const name of destination.names) {
      if (types.includes(name) || title === name) score = Math.max(score, 8);
      else if (name.includes(" ") && categoryPhrase(title, name)) score = Math.max(score, 7);
      else if (title.startsWith(name + " ")) score = Math.max(score, 6);
      else if (labels.includes(name)) score = Math.max(score, 5);
      else if (destination.sub && categoryPhrase(title, name)) score = Math.max(score, 4);
    }
    if (!score) return { destination, score };
    if (destination.sub) score += 0.5;
    if (destination.names.some(name => name.includes(" ") && categoryPhrase(description, name))) score += 0.25;
    return { destination, score };
  }).sort((a, b) => b.score - a.score);
}

function matchDestination(scores: ReturnType<typeof rankDestinations>) {
  const best = scores[0];
  const tied = best && scores[1]?.score === best.score;
  if (!best || best.score < 3 || tied) return { ambiguous: !!best && best.score >= 3 && tied, score: 0 };
  return { destination: best.destination, ambiguous: false, score: best.score };
}

const reviewTypeHints: [RegExp, string, string][] = [
  [/^(?:כובע|כובעי)(?: |$)|^(?:(?:mesh |baseball )?cap|hat)\b/u, "acc", "כובעים"],
  [/^(?:גופיה|גופייה)(?: |$)|^tank top\b/u, "pro", "חולצות"],
  [/^(?:ערכת|ערכות) קפה(?: |$)|^coffee kit\b/u, "acc", "אביזרים למטבח"],
  [/^(?:רצועת|רצועות) קשירה(?: |$)|^(?:ratchet|tie down) strap\b/u, "acc", "אביזרים נלווים"],
];

function reviewRecommendation(product: ReviewProduct, scores: ReturnType<typeof rankDestinations>, assignableIds: Set<string>) {
  const eligible = scores.filter(({ destination }) => assignableIds.has(destination.id));
  const rankedChild = eligible.find(({ destination, score }) => destination.sub && score >= 4);
  if (rankedChild) return rankedChild.destination;
  const title = normalized(product.title);
  const hint = reviewTypeHints.find(([pattern]) => pattern.test(title));
  const hinted = hint && eligible.find(({ destination }) =>
    destination.parentId === hint[1] && normalized(destination.sub) === normalized(hint[2]));
  return (hinted ?? eligible.find(({ score }) => score >= 4))?.destination;
}

function proposedParent(source: Source, product: Pick<ReviewProduct, "title" | "productType">) {
  const names = source.path.map(name => normalized(categoryFilterLabel(name)));
  const byPath = CATS.filter(category => names.includes(normalized(category.name)) || category.subs.some(sub => names.includes(normalized(sub))));
  if (byPath.length === 1) return byPath[0].name;
  const text = `${normalized(categoryFilterLabel(source.name))} ${normalized(product.productType)} ${normalized(product.title)}`;
  const hints: [string, RegExp][] = [
    ["shoes", /נעל|הנעלה|מגף|מגפ|\b(shoe|shoes|boot|boots|footwear)\b/],
    ["safety", /ציוד מגן|מיגון|הגנ[הת]|קסד|עזרה ראשונה|\b(protection|protective equipment|ppe|first aid)\b/],
    ["kitchen", /שף|מטבח|טבח|\b(chef|kitchen)\b/],
    ["winter", /חורף|תרמי|\b(winter|thermal)\b/],
  ];
  const bySource = hints.filter(([, pattern]) => pattern.test(normalized(categoryFilterLabel(source.name))));
  const matching = bySource.length === 1 ? bySource : hints.filter(([, pattern]) => pattern.test(text));
  return matching.length === 1 ? CATS.find(category => category.id === matching[0][0])?.name : undefined;
}

function groupCategorySuggestion(label: string, row: ScannedProduct, sources: Source[], destinations: Destination[], collections: Map<string, string>): Proposed {
  const key = normalized(label);
  const outdoors = label === outdoorFootwear.sub;
  const source = sources.find(item => normalized(canonicalCategoryLabel(item.label)) === key) ?? { ...emptySource, label };
  const targets = destinations.filter(destination => destination.sub && destination.manual &&
    (outdoors ? outdoorFootwearPath(destination) : destination.names.includes(key)));
  if (targets.length === 1) {
    const target = targets[0];
    return { kind: row.shopify_product_id ? "change" : "existing", source, title: target.title, parent: target.parent,
      reason: "סוג המוצרים מתאים לתת־הקטגוריה הזו.", targetIds: [target.id], productGroup: true };
  }
  const unplaced = [...collections].filter(([, name]) => normalized(canonicalCategoryLabel(name)) === key);
  const targetIds = unplaced.length === 1 && !targets.length ? [unplaced[0][0]] : [];
  const parent = outdoors ? outdoorFootwear.parent :
    /^(?:מכנס\p{L}*|חולצ\p{L}*)(?: |$)/u.test(normalized(label)) ? CATS.find(category => category.id === "pro")?.name :
      proposedParent({ ...emptySource, name: label }, { title: label });
  return {
    kind: targetIds.length ? "place" : "new", source, title: label, parent, targetIds, productGroup: true,
    reason: outdoors ? "נעלי טיולים וסניקרס לפנאי צריכות מיקום נפרד מהנעליים המקצועיות." :
      `נמצאה קבוצה של לפחות ${categoryOpportunityMinimum} מוצרים מאותו סוג שיכולה לקבל תת־קטגוריה משלה.`,
  };
}

function categorySuggestion(
  row: ScannedProduct, site: Site, destinations: Destination[], allCollections: Map<string, string>,
  sources: Source[], scores: ReturnType<typeof rankDestinations>, excludedCollections: Set<string>,
): Proposed | null {
  const approved = mappedCollections(row.category_ids, site).filter(id => allCollections.has(id) && !excludedCollections.has(id));
  const direct = [...new Set(sources.flatMap(s => site.mappings[s.id] ?? []))];
  const approvedDestinations = destinations.filter(d => d.collectionIds.some(id => direct.includes(id)));
  const product = row.snapshot;
  const { destination, ambiguous, score } = matchDestination(scores);
  const source = sources.find(s => destination?.names.includes(normalized(s.label))) ?? sources[0] ?? emptySource;
  const conflict = destination && score >= 6 && approvedDestinations.length > 0 && !approvedDestinations.includes(destination);
  if (approvedDestinations.some(target => target.sub) && !conflict) {
    if (!row.shopify_product_id) return null;
    const matching = approvedDestinations.find(d => d === destination);
    const targets = matching ? [matching] : approvedDestinations;
    return { kind: "change", source, title: [...new Set(targets.map(d => d.title))].join(" · "),
      parent: [...new Set(targets.map(d => d.parent))].join(" · "), reason: "מיפוי הספק שאושר מצביע על שיוך אחר.",
      targetIds: targets.map(d => d.id) };
  }

  const knownLabels = new Set(destinations.flatMap(d => d.names));
  const named = sources.find(s => {
    const label = canonicalCategoryLabel(s.label);
    const key = normalized(label);
    return !catalogNames.has(key) && !knownLabels.has(key) && productSupportsCategory(label, product.title, product.productType);
  });
  const family = ["נעלי ריצה כביש", "נעלי ריצה שטח", "עזרה ראשונה"].find(label =>
    !knownLabels.has(normalized(label)) && productSupportsCategory(label, product.title, product.productType));
  if (!destination?.sub && !ambiguous && (named || family)) {
    const title = canonicalCategoryLabel(named?.label ?? family!);
    const category = named ?? { ...emptySource, label: title };
    const candidates = [...allCollections].filter(([, name]) => normalized(canonicalCategoryLabel(name)) === normalized(title));
    const parent = proposedParent(category, product);
    if (candidates.length === 1) return { kind: "place", source: category, title, parent,
      reason: "קיים אוסף שעונה על סוג המוצר. צריך לשייך אותו למבנה הקטגוריות באתר.", targetIds: [candidates[0][0]] };
    return { kind: "new", source: category, title, parent,
      reason: "פרטי המוצרים מצביעים על סוג מוצר שאין לו קטגוריה מתאימה באתר.", targetIds: [] };
  }

  if (destination) {
    if (!row.shopify_product_id && destination.collectionIds.some(id => approved.includes(id))) return null;
    if (!row.shopify_product_id && !destination.manual) return { kind: "review", source, title: destination.title, parent: destination.parent,
      reason: "קטגוריית האתר קיימת, ויש לבחור לה אוסף ידני מתאים לייבוא.", targetIds: [] };
    return { kind: row.shopify_product_id ? "change" : "existing", source, title: destination.title, parent: destination.parent,
      reason: "פרטי המוצרים מתאימים לקטגוריה קיימת באתר.", targetIds: [destination.id] };
  }

  const inherited = destinations.filter(d => d.collectionIds.some(id => approved.includes(id)));
  if (inherited.length && (!ambiguous || inherited.length === 1)) {
    if (!row.shopify_product_id) return null;
    return { kind: "change", source, title: [...new Set(inherited.map(d => d.title))].join(" · "),
      parent: [...new Set(inherited.map(d => d.parent))].join(" · "), reason: "המיפוי לקטגוריית האב מצביע על שיוך אחר.",
      targetIds: inherited.map(d => d.id) };
  }
  return { kind: "review", source, title: "מוצרים שדורשים בחירת קטגוריה", parent: proposedParent(source, product),
    reason: "לא נמצאה התאמה חד־משמעית לקטגוריה באתר.", targetIds: [] };
}

export function suggestedProductCategoryIds(
  snapshot: ReviewProduct, categoryIds: string[], site: Site, collections: SupplierCollectionOption[],
) {
  if (isOutdoorFootwear(snapshot)) {
    const target = outdoorFootwearCollection(collections);
    return target ? [target] : [];
  }
  const destinations = destinationsFor(collections).filter(destination => !outdoorFootwearPath(destination));
  const excluded = new Set(collections.filter(collection => collection.paths.some(outdoorFootwearPath)).map(collection => collection.id));
  const approved = mappedCollections(categoryIds, site).filter(id => !excluded.has(id));
  if (destinations.some(destination => destination.collectionIds.some(id => approved.includes(id)))) return approved;
  const all = new Map(collections.map(collection => [collection.id, collection.title]));
  const unlinked = { source_id: "", category_ids: categoryIds, shopify_product_id: null, snapshot };
  const sources = sourcesFor(unlinked, site);
  const recommendation = categorySuggestion(unlinked, site, destinations, all, sources, rankDestinations(snapshot, sources, destinations), excluded);
  return recommendation?.kind === "existing" ? recommendation.targetIds : approved;
}

export async function readCategoryReview(site: Site, options?: SupplierCollectionOption[]) {
  const groups = new Map<string, Suggestion>();
  if (!site.pull_started_at) return groups;
  const [collections, opportunities] = await Promise.all([options ?? supplierStorefrontCollections(), readSupplierCategoryAudit(site)]);
  const collectionNames = new Map(collections.map(c => [c.id, c.title]));
  const destinations = destinationsFor(collections);
  const ordinaryDestinations = destinations.filter(destination => !outdoorFootwearPath(destination));
  const outdoorCollections = new Set(collections.filter(collection => collection.paths.some(outdoorFootwearPath)).map(collection => collection.id));
  const assignableIds = new Set(collections.filter(c => c.published && c.manual && c.paths.length).map(c => c.id));
  const opportunitiesByProduct = new Map<string, string>();
  for (const { label, ids } of opportunities) for (const id of ids) {
    opportunitiesByProduct.set(id, label);
  }
  let cursor: string | undefined;
  for (;;) {
    const rows: ScannedProductFields[] = await supplierRequest<ScannedProductFields>("ahim_supplier_previews", "GET", {
      ...shopFilter(), supplier: "eq." + supplierKey(site.domain), review_state: "in.(known,pending)",
      scan_error: "is.null", scanned_at: "gte." + site.pull_started_at, order: "source_id.asc", limit: "100",
      select: "source_id,category_ids,shopify_product_id,collection_ids,revision,image:snapshot->images->>0,title:snapshot->>title,category:snapshot->>category,productType:snapshot->>productType,brand:snapshot->>brand,description:snapshot->description,attributes:snapshot->attributes",
      ...(cursor ? { source_id: "gt." + cursor } : {}),
    });
    if (!rows.length) break;
    cursor = rows.at(-1)!.source_id;
    const candidates = rows.flatMap(({ source_id, category_ids, shopify_product_id, collection_ids, revision, image, ...snapshot }) => {
      const row = { source_id, category_ids, shopify_product_id, snapshot };
      const sources = sourcesFor(row, site);
      const group = isOutdoorFootwear(snapshot) ? outdoorFootwear.sub : opportunitiesByProduct.get(source_id);
      if (!group && !shopify_product_id && collection_ids?.some(id => assignableIds.has(id))) return [];
      const scores = rankDestinations(snapshot, sources, ordinaryDestinations);
      const suggestion = group ? groupCategorySuggestion(group, row, sources, destinations, collectionNames) :
        categorySuggestion(row, site, ordinaryDestinations, collectionNames, sources, scores, outdoorCollections);
      if (!suggestion) return [];
      const targets = destinations.filter(destination => destination.collectionIds.some(id => suggestion.targetIds.includes(id)));
      const target = targets.find(destination => destination.title === suggestion.title && destination.parent === suggestion.parent) ??
        (targets.length === 1 ? targets[0] : undefined);
      const preferred = suggestion.kind === "review" ? reviewRecommendation(snapshot, scores, assignableIds) : target;
      const recommendation = preferred && assignableIds.has(preferred.id)
        ? { id: preferred.id, parentId: preferred.parentId, parent: preferred.parent, sub: preferred.sub } : undefined;
      const proposedCategory = suggestion.kind !== "review" || suggestion.title !== "מוצרים שדורשים בחירת קטגוריה"
        ? preferred ? (preferred.sub ? preferred.parent + " / " + preferred.sub : preferred.parent)
          : [suggestion.parent === suggestion.title ? undefined : suggestion.parent, suggestion.title].filter(Boolean).join(" / ")
        : undefined;
      return [{ row, suggestion, revision, image, recommendation, proposedCategory, collection_ids }];
    });
    const reviews = new Map<string, string>();
    const memberships = await supplierCollectionMemberships(candidates.flatMap(({row}) => row.shopify_product_id ? [row.shopify_product_id] : []), reviews);
    for (const { row, suggestion, revision, image, recommendation, proposedCategory, collection_ids } of candidates) {
      const current = row.shopify_product_id ? memberships.get(row.shopify_product_id) :
        collection_ids?.length ? collection_ids : mappedCollections(row.category_ids, site);
      const reviewed = row.shopify_product_id && reviews.get(row.shopify_product_id);
      if (!suggestion.productGroup && reviewed && assignableIds.has(reviewed) && current?.includes(reviewed)) continue;
      if ((suggestion.kind === "change" || (suggestion.productGroup && suggestion.kind === "existing")) &&
        current && suggestion.targetIds.every(id => current.includes(id) ||
        destinations.some(destination => destination.collectionIds.includes(id) && destination.collectionIds.some(candidate => current.includes(candidate))))) continue;
      const key = createHash("sha256").update(JSON.stringify([
        suggestion.kind, normalized(suggestion.title), normalized(suggestion.parent),
      ])).digest("hex").slice(0, 24);
      const group = groups.get(key) ?? { ...suggestion, sources: [], products: [] };
      if (suggestion.source.label && !group.sources.some(source => source.id === suggestion.source.id && source.name === suggestion.source.name)) {
        group.sources.push(suggestion.source);
      }
      group.products.push({ id: row.source_id, title: row.snapshot.title, shopifyId: row.shopify_product_id,
        revision, image: image || undefined, recommendation, proposedCategory,
        current: current ? storefrontCategoryLabels(collections, current) : null });
      groups.set(key, group);
    }
    if (rows.length < 100) break;
  }
  return groups;
}

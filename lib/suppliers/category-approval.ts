import "server-only";
import { createHash } from "node:crypto";
import { CATS } from "@/lib/catalog";
import { storefrontCategories, storefrontCategoryPlacements, storefrontSubcategory, type StorefrontCategoryChoice } from "@/lib/category-placement";
import { changeAdminStore } from "@/lib/admin/storage";
import { adminGraphQL } from "@/lib/shopify/admin-bundles";
import { menuPlacements } from "@/lib/shopify/fetch-catalog";
import { revalidateTag } from "next/cache";
import { sitePublication } from "./publication";
import { supplierCollections } from "./shopify";
import { addCategoryMapping, getSite } from "./sites";
import type { Site } from "./catalog-model";

type Collection = { id: string; onSite: boolean; ruleSet: { appliedDisjunctively: boolean } | null };
type UserError = { message: string };
const categoryNameKey = (title: string) => title.normalize("NFKC").toLowerCase();

async function createCollection(title: string, parentId: string, publication: string) {
  const identity = JSON.stringify([parentId, categoryNameKey(title)]);
  const handle = "ahim-category-" + createHash("sha256").update(identity).digest("hex").slice(0, 24);
  const { collectionByIdentifier } = await adminGraphQL<{ collectionByIdentifier: Collection | null }>(
    `query ApprovedCategory($handle:String!,$publication:ID!){ collectionByIdentifier(identifier:{handle:$handle}){
      id ruleSet{appliedDisjunctively} onSite:publishedOnPublication(publicationId:$publication) } }`, { handle, publication },
  );
  if (collectionByIdentifier) return collectionByIdentifier;
  const { collectionCreate } = await adminGraphQL<{ collectionCreate: { collection: Collection | null; userErrors: UserError[] } }>(
    `mutation CreateApprovedCategory($collection:CollectionCreateInput!,$publication:ID!){ collectionCreate(collection:$collection){
      collection{id ruleSet{appliedDisjunctively} onSite:publishedOnPublication(publicationId:$publication)} userErrors{message} } }`,
    { collection: { title, handle }, publication },
  );
  if (!collectionCreate.collection || collectionCreate.userErrors.length) {
    throw new Error(collectionCreate.userErrors[0]?.message || "יצירת האוסף ב־Shopify נכשלה.");
  }
  return collectionCreate.collection;
}

async function publishCollection(id: string, publication: string) {
  const { publishablePublish } = await adminGraphQL<{ publishablePublish: { publishable: { onSite: boolean } | null; userErrors: UserError[] } }>(
    `mutation PublishApprovedCollection($id:ID!,$publication:ID!){ publishablePublish(id:$id,input:[{publicationId:$publication}]){
      publishable{onSite:publishedOnPublication(publicationId:$publication)} userErrors{message} } }`, { id, publication },
  );
  if (!publishablePublish.publishable?.onSite || publishablePublish.userErrors.length) {
    throw new Error(publishablePublish.userErrors[0]?.message || "Shopify עדיין לא אישרה את פרסום האוסף לערוץ האתר.");
  }
}

export async function saveStorefrontCategory(name: string, parentId: string, selectedCollectionId = "") {
  const title = name.trim().replace(/\s+/g, " ");
  if (!title || title.length > 100 || !/^[\p{L}\p{N}]/u.test(title) || /[\p{C}]/u.test(title))
    throw new Error("הזינו שם קטגוריה תקין באורך של עד 100 תווים.");
  const publication = sitePublication();
  let choice!: StorefrontCategoryChoice;
  await changeAdminStore(async store => {
    const placements = storefrontCategoryPlacements(store.categoryPlacements);
    const categories = storefrontCategories(CATS, placements);
    const existing = parentId ? categories.find(category => category.id === parentId) :
      categories.find(category => categoryNameKey(category.name) === categoryNameKey(title));
    if (parentId && !existing) throw new Error("בחרו קטגוריה ראשית קיימת.");
    const root = existing ?? { id: "category-" + createHash("sha256").update(categoryNameKey(title)).digest("hex").slice(0, 24), name: title, subs: [] };
    const requested = storefrontSubcategory(root.id, title);
    const label = parentId ? root.subs.find(sub => categoryNameKey(sub) === categoryNameKey(requested)) ?? requested : "";
    const collections = await supplierCollections(publication);
    const selected = collections.find(collection => collection.id === selectedCollectionId);
    if (selectedCollectionId && (!selected || selected.ruleSet)) throw new Error("בחרו אוסף ידני קיים ב־Shopify.");
    const matching = (path: { parentId: string; sub: string }) =>
      path.parentId === root.id && categoryNameKey(path.sub) === categoryNameKey(label);
    const configured = menuPlacements(collections, placements);
    const reusable = collections.filter(item => !item.ruleSet && configured.get(item.handle)?.some(matching));
    const collection = selected ?? reusable.find(item => item.onSite) ?? reusable[0] ??
      await createCollection(label || root.name, parentId ? root.id : "root:" + root.id, publication);
    if (collection.ruleSet) throw new Error("אוסף אוטומטי אינו מתאים למיפוי ייבוא הספק.");
    const prior = placements.find(placement => placement.collectionId === collection.id && placement.parentId === root.id);
    if (prior && categoryNameKey(storefrontSubcategory(root.id, prior.label)) !== categoryNameKey(label))
      throw new Error("לאוסף כבר הוגדר שם סינון תחת קטגוריה זו. בחרו את השם הקיים או אוסף אחר.");
    if (!collection.onSite) await publishCollection(collection.id, publication);
    if (!prior) store.categoryPlacements = [...placements, {
      collectionId: collection.id, parentId: root.id, label,
      ...(!parentId && !CATS.some(category => category.id === root.id) ? { parentName: root.name } : {}),
    }];
    choice = { id: collection.id, parentId: root.id, parent: root.name, sub: label };
  });
  revalidateTag("shop-catalog");
  return choice;
}

export function createStorefrontCategory(form: FormData) {
  return saveStorefrontCategory(String(form.get("label") ?? ""), String(form.get("parent") ?? ""), String(form.get("collection") ?? ""));
}

export async function approveSupplierCategory(site: Site, form: FormData) {
  const sourceId = String(form.get("category") ?? "");
  const parentId = String(form.get("parent") ?? "");
  if (!parentId) throw new Error("בחרו קטגוריה ראשית.");
  if (!site.categories.some(c => c.id === sourceId) || !site.pull_started_at || site.pull_started_at !== form.get("run") ||
    site.state === "queued" || site.state === "running") {
    throw new Error("נתוני המשיכה השתנו. חזרו לדוח המעודכן ובחרו שוב את הקטגוריה.");
  }
  const category = await saveStorefrontCategory(String(form.get("label") ?? ""), parentId, String(form.get("collection") ?? ""));
  try {
    const latest = await getSite(site.domain);
    await addCategoryMapping(latest, sourceId, category.id, site.pull_started_at);
  } catch {
    return { message: "תת־הקטגוריה נשמרה באתר. שיוך קטגוריית הספק ממתין לעדכון במסך בחירת קטגוריות.", mapped: false };
  }
  return { message: `הסינון ״${category.sub}״ נשמר תחת ״${category.parent}״ ושויך לקטגוריית הספק.`, mapped: true };
}

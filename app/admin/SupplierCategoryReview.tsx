import Link from "next/link";
import { AdminBackLink } from "@/components/AdminBackLink";
import { StorefrontCategoryCreator } from "@/components/StorefrontCategoryCreator";
import { RefreshWhileBusy } from "@/components/SupplierCatalog";
import { SupplierCategoryApproval } from "@/components/SupplierCategoryApproval";
import { SupplierCategoryReviewList } from "@/components/SupplierCategoryReviewList";
import { CATS } from "@/lib/catalog";
import { storefrontCategories } from "@/lib/category-placement";
import { readAdminStore } from "@/lib/admin/storage";
import { shopDomain } from "@/lib/shopify/config";
import { catalogPageSize, supplierUrl, type Site } from "@/lib/suppliers/catalog-model";
import { readCategoryReview, storefrontCategoryChoices } from "@/lib/suppliers/category-review";
import { manualCollections } from "@/lib/suppliers/shopify";
import { supplierStorefrontCollections } from "@/lib/suppliers/storefront-collections";

const labels = {
  existing: "שיוך מוצע לקטגוריה קיימת",
  change: "בדיקת שיוך של מוצר שכבר יובא",
  new: "הצעה לקטגוריה חדשה",
  place: "אוסף קיים שצריך מקום באתר",
  review: "נדרשת בחירת קטגוריה",
};

export async function SupplierCategoryReview({ site, groupKey, pageParam }: { site: Site; groupKey: string; pageParam?: string }) {
  const busy = site.state === "queued" || site.state === "running";
  const base = supplierUrl(site.domain, "category-review");
  const catalog = supplierUrl(site.domain, "catalog");
  const categories = storefrontCategories(CATS, (await readAdminStore()).categoryPlacements);
  const collections = !busy && site.pull_started_at ? await supplierStorefrontCollections() : [];
  const report = busy ? null : await readCategoryReview(site, collections);
  const group = groupKey ? report?.get(groupKey) : undefined;
  const sourceOptions = [...new Map((group?.sources ?? []).filter(source => source.id).map(source => [source.id,
    { id: source.id, title: [...source.path, source.name].join(" / ") },
  ])).values()];
  const needsCategory = group && (group.kind === "new" || group.kind === "place");
  const suggestedSubcategory = needsCategory && group.productGroup ? {
    label: group.title, parentId: categories.find(category => category.name === group.parent)?.id,
    collectionId: group.targetIds.find(id => collections.some(collection => collection.id === id && collection.manual)),
  } : undefined;
  const canApprove = needsCategory && !group.productGroup && sourceOptions.length > 0 && !!site.pull_started_at;
  const approvalCollections = canApprove ? await manualCollections() : [];
  const parentOrder = (parent?: string) => {
    const index = categories.findIndex(category => category.name === parent);
    return index < 0 ? categories.length : index;
  };
  const entries = [...(report?.entries() ?? [])].sort(([, first], [, second]) =>
    parentOrder(first.parent) - parentOrder(second.parent) || first.title.localeCompare(second.title, "he"));
  const total = group?.products.length ?? entries.length;
  const requested = Number(pageParam);
  const page = Number.isSafeInteger(requested) && requested > 0 ? Math.min(requested, Math.max(1, Math.ceil(total / catalogPageSize))) : 1;
  const initialShown = page * catalogPageSize;
  const listKey = JSON.stringify([site.domain, site.pull_started_at, group ? groupKey : "", page]);

  return <section className="admin-panel supplier-box supplier-category-review">
    <RefreshWhileBusy active={busy} />
    <AdminBackLink href={group ? base : catalog} label={group ? "חזרה לכל ההצעות" : "חזרה לקטלוג הספק"} />
    <header>
      <h2>בדיקת קטגוריות</h2>
      <bdi>{site.domain}</bdi>
    </header>
    {busy && <p role="status">הדוח יהיה זמין כשהמשיכה תסתיים.</p>}
    {site.state === "failed" && <p role="status">המשיכה נעצרה. הדוח כולל את המוצרים שנסרקו בהצלחה עד לעצירה.</p>}
    {report && !report.size && <p>{site.pull_started_at ? "במשיכה האחרונה לא נמצאו הצעות לבדיקה." : "הדוח יופיע אחרי המשיכה הראשונה."}</p>}
    {!group && <StorefrontCategoryCreator categories={categories} />}
    {!group && entries.length > 0 && <SupplierCategoryReviewList key={listKey} domain={site.domain} initialShown={initialShown}
      groups={entries.map(([id, entry]) => ({ id, status: labels[entry.kind], title: entry.title, reason: entry.reason,
        parent: entry.parent === entry.title ? undefined : entry.parent,
        productCount: entry.products.length }))} />}
    {group && <>
      <div className="supplier-category-review-detail">
        <small>{labels[group.kind]}</small>
        <h3>{group.title}</h3>
        <p>{group.reason}</p>
        {sourceOptions.length === 1 && <p>קטגוריית ספק · {sourceOptions[0].title}</p>}
        {group.parent && <p>קטגוריה ראשית באתר · {group.parent}</p>}
        {canApprove && <SupplierCategoryApproval key={groupKey} domain={site.domain} run={site.pull_started_at!}
          sources={sourceOptions} label={group.title} parent={categories.find(c => c.name === group.parent)?.id}
          parents={categories.map(c => ({ id: c.id, title: c.name }))}
          collections={approvalCollections.map(({ id, title }) => ({ id, title }))}
          target={group.targetIds.find(id => approvalCollections.some(collection => collection.id === id))} catalogUrl={catalog} />}
        <div className="supplier-toolbar">
          {!group.productGroup && sourceOptions.length === 1 && <Link className="btn btn-line" href={supplierUrl(site.domain, "setup", { cat: sourceOptions[0].id })}>
            עריכת המיפוי של קטגוריית הספק
          </Link>}
          {!group.productGroup && sourceOptions.length > 1 && <details>
            <summary>קטגוריות הספק בקבוצה · {sourceOptions.length}</summary>
            <ul>{sourceOptions.map(source => <li key={source.id}>
              <Link href={supplierUrl(site.domain, "setup", { cat: source.id })} prefetch={false}>{source.title}</Link>
            </li>)}</ul>
          </details>}
          {(group.kind === "new" || group.kind === "place") && <a className="btn btn-line" href={`https://${shopDomain()}/admin/collections`}>
            ניהול אוספים ב־Shopify
          </a>}
        </div>
      </div>
      <SupplierCategoryReviewList key={listKey} domain={site.domain} initialShown={initialShown} shop={shopDomain()} products={group.products} categories={categories}
        choices={storefrontCategoryChoices(collections)} suggestedSubcategory={suggestedSubcategory} />
    </>}
  </section>;
}

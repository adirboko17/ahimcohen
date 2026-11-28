import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Fragment, Suspense, type ComponentType, type ReactNode } from "react";
import { CATS, type Category, type Product } from "@/lib/catalog";
import { storefrontCategories } from "@/lib/category-placement";
import { AdminBackLink } from "@/components/AdminBackLink";
import { AdminApproveReviewButton, AdminBundleDialog, AdminBundleFields, AdminForm, AdminLabelEditor, AdminLogin, AdminProductField, AdminProductList, AdminProductSummary, AdminRemoveButton, CopyAdminLink } from "@/components/AdminControls";
import { AdminHeroEditor } from "@/components/AdminHeroEditor";
import { AdminProductSets } from "@/components/AdminProductSets";
import { AdminHeroOrder } from "@/components/AdminHeroOrder";
import { StorefrontCategoryCreator } from "@/components/StorefrontCategoryCreator";
import { IconBag, IconCheck, IconFilter, IconFwd, IconGrid, IconHome, IconPackages, IconPencil, IconPlus, IconUpload, IconUser } from "@/components/icons";
import { isAdmin } from "@/lib/admin/access";
import { ReviewRatingInput, ReviewStars } from "@/components/ReviewStars";
import { bundleGroupSnapshot, heroImageTarget, heroIsPublished, reviewAwaitsApproval, type AdminBundle, type AdminHero, type AdminLabel, type AdminRedirect, type AdminReview, type AdminSale, type AdminStore, type HeroDevice } from "@/lib/admin/models";
import { readAdminStore } from "@/lib/admin/storage";
import { readCategoryProductCounts } from "@/lib/admin/category-product-counts";
import { readReviews } from "@/lib/admin/reviews";
import { fmt } from "@/lib/pricing";
import { loadShopCatalog } from "@/lib/shopify/load-catalog";
import "./admin.css";
import { Suppliers } from "./Suppliers";
import { ColorReview } from "./ColorReview";
import { BusinessQuotes } from "./BusinessQuotes";
import { AdminNavigation } from "./AdminNavigation";
import { NewProductForm } from "./NewProductForm";
import "./new-product.css";
import { BRANDS, uniqueBrandNames } from "@/lib/brands";

export const metadata: Metadata = { title: "ניהול החנות", robots: { index: false, follow: false } };

const tabs = {
  sets: { title: "השלימו את הסט", create: "", edit: "", description: "בחרו מוצר כדי לראות את הסט שמוצג בעמוד שלו.", Icon: IconPackages },
  bundles: { title: "באנדלים למוצרים", create: "באנדל חדש", edit: "עריכת באנדל", description: "נהלו את החבילות שמוצעות ללקוחות בדפי המוצרים.", Icon: IconPackages },
  sales: { title: "מכירה מהירה", create: "קישור מכירה חדש", edit: "עריכת קישור מכירה", description: "נהלו קישורים ישירים לרכישת מוצר בקופת Shopify.", Icon: IconBag },
  labels: { title: "תוויות מבצע", create: "תווית חדשה", edit: "עריכת תווית", description: "נהלו את התוויות שמופיעות לצד שמות המוצרים.", Icon: IconGrid },
  reviews: { title: "ביקורות למוצרים", create: "ביקורת חדשה", edit: "עריכת ביקורת", description: "בחרו מוצר כדי לצפות בביקורות שלו, להוסיף ביקורת או לאשר ביקורות מהאתר.", Icon: IconCheck },
  links: { title: "קישורים מקוצרים", create: "קישור מקוצר חדש", edit: "עריכת קישור מקוצר", description: "נהלו את הכתובות המקוצרות ואת יעדי ההפניה שלהן.", Icon: IconFwd },
  heroes: { title: "עיצוב ההירו", create: "הוספת באנר", edit: "עריכת באנר", description: "בחרו תמונות למחשב ולמובייל והגדירו לאן כל אחת תוביל בלחיצה.", Icon: IconUpload },
} as const;
type Tab = keyof typeof tabs;

const overview = { title: "סקירת החנות", description: "מצב הקטלוג, הבאנדלים והבאנרים שמוצגים בדף הבית.", Icon: IconHome };
const categoryTool = { title: "קטגוריות החנות", description: "הוספת קטגוריות ראשיות ותתי־קטגוריות לקטלוג.", Icon: IconGrid };
const newProductTool = { title: "הוספת מוצר", description: "בחרו קטגוריות ומותג, קבעו מחיר ופרסמו את המוצר באתר.", Icon: IconPlus };
const colorTool = { title: "מיפוי צבעים", description: "בחרו משפחת צבע ודוגמית לגוונים שמופיעים תחת ״צבעים נוספים״.", Icon: IconFilter };
const quotesTool = { title: "בקשות להצעות מחיר", description: "בקשות שהתקבלו מעמוד ההזמנות לעסקים, מהחדשה לישנה.", Icon: IconBag };
const navigationTools = {
  "new-product": newProductTool, categories: categoryTool, colors: colorTool, quotes: quotesTool,
  suppliers: { title: "ספקים וייבוא מוצרים", description: "סריקת קטלוגים וייבוא מוצרים מספקים.", Icon: IconPackages },
  bundles: tabs.bundles, sets: tabs.sets, labels: tabs.labels, reviews: tabs.reviews, heroes: tabs.heroes,
};
type NavigationTool = keyof typeof navigationTools;
const toolGroups = [
  { label: "מוצרים וקטגוריות", Icon: IconPackages, tools: ["new-product", "categories", "colors", "suppliers"] },
  { label: "לקוחות ופניות", Icon: IconUser, tools: ["quotes", "reviews"] },
  { label: "תצוגה ומבצעים", Icon: IconGrid, tools: ["heroes", "labels", "bundles", "sets"] },
] satisfies { label: string; Icon: ComponentType; tools: NavigationTool[] }[];

const loginErrors: Record<string, string> = {
  locked: "יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.",
  missing: "חשבון הניהול של החנות טרם הוגדר.",
  invalid: "כתובת האימייל או הסיסמה שגויות.",
};

function adminUrl(tab: Tab | NavigationTool, options?: { edit?: string; manage?: string; product?: string }) {
  const query = new URLSearchParams({ tab });
  if (options?.edit) query.set("edit", options.edit);
  if (options?.manage) query.set("manage", options.manage);
  if (options?.product) query.set("product", options.product);
  return "/admin?" + query;
}

type AdminQuery = { q?: string; site?:string; view?:string; cat?:string; page?:string; item?:string; status?:string; tab?: string; error?: string; product?: string; manage?: string; edit?: string; saved?: string };

export default async function AdminPage({ searchParams }: { searchParams: Promise<AdminQuery> }) {
  const params=await searchParams;
  const { tab: query, error, product: requestedProduct, manage, edit: requestedEditor, saved } = params;
  if (!(await isAdmin())) return <AdminLogin error={error && Object.hasOwn(loginErrors, error) ? loginErrors[error] : undefined} />;
  if (query === "offers") redirect(adminUrl("sets"));
  const tab = typeof query === "string" && Object.hasOwn(tabs, query) ? query as Tab : undefined;
  const supplierView = query === "suppliers";
  const categoryView = query === "categories";
  const colorView = query === "colors";
  const quotesView = query === "quotes";
  const newProductView = query === "new-product";
  const overviewView = !tab && !supplierView && !categoryView && !colorView && !quotesView && !newProductView;
  const [store, catalog] = await Promise.all([readAdminStore().then(async (data) => tab === "reviews" || overviewView
    ? { ...data, reviews: await readReviews(data.reviews) } : data), supplierView || categoryView || colorView || quotesView ? {products: [], categories: []} : loadShopCatalog()]);
  const products = new Map(catalog.products.map((item) => [item.id, item]));
  const reviewProductId = tab === "reviews" && typeof requestedProduct === "string" ? requestedProduct : undefined;
  const productReviews = reviewProductId ? store.reviews.filter((item) => item.productId === reviewProductId) : [];
  const reviewProduct = reviewProductId ? products.get(reviewProductId) : undefined;
  const reviewHref = reviewProductId && (reviewProduct || productReviews.length) ? adminUrl("reviews", { product: reviewProductId }) : undefined;
  if (tab === "reviews" && typeof requestedEditor === "string" && requestedEditor !== "new") {
    const pendingReview = (reviewHref ? productReviews : store.reviews).find((item) => item.id === requestedEditor && reviewAwaitsApproval(item));
    if (pendingReview) redirect(adminUrl("reviews", { product: pendingReview.productId }));
  }
  const group = tab === "bundles" && typeof manage === "string" ? manage : undefined;
  const groupProductId = group?.startsWith("product:") ? group.slice("product:".length) : undefined;
  const groupProduct = groupProductId ? products.get(groupProductId) : undefined;
  const groupBundles = group ? store.bundles.filter((item) => bundleGroup(item) === group) : [];
  const manageHref = group && (groupProduct || groupBundles.length) ? adminUrl("bundles", { manage: group }) : undefined;
  const prefilledProduct = manageHref ? requestedEditor === "new" ? groupProduct?.id : undefined
    : tab === "bundles" && typeof requestedProduct === "string" ? products.get(requestedProduct)?.id : undefined;
  const create = (requestedEditor === "new" && (!reviewHref || !!reviewProduct)) || (!!prefilledProduct && !requestedEditor);
  const editableItems = manageHref ? groupBundles : reviewHref ? productReviews : tab ? store[tab] : [];
  const editId = !create && typeof requestedEditor === "string" && editableItems.some((item) => item.id === requestedEditor)
    ? requestedEditor : undefined;
  const editing = !!tab && tab !== "heroes" && tab !== "sets" && (create || !!editId);
  const info = supplierView ? { title: "ניהול ספקים וייבוא מוצרים", description: "סריקת קטלוגים, התאמת קטגוריות ותמחור מוצרים", Icon: IconPackages }
    : categoryView ? categoryTool : colorView ? colorTool : quotesView ? quotesTool : newProductView ? newProductTool : tab ? tabs[tab] : overview;
  const Icon = info.Icon;
  const title = tab === "heroes" ? "באנרים בדף הבית" : manageHref ? "עריכת באנדלים למוצר" : reviewHref ? "ביקורות למוצר"
    : tab && editing ? (create ? tabs[tab].create : tabs[tab].edit) : info.title;
  const heroEditing = tab === "heroes" && (create || !!editId);
  const backHref = tab && (reviewHref || manageHref || editing || heroEditing) ? adminUrl(tab) : undefined;

  return (
    <main className="admin-page">
      <header className="admin-header">
        <div className="admin-brand"><Link href="/admin" aria-label="ניהול החנות"><img src="/logo.avif" alt="Cohen Brothers" width={144} /></Link><span>ניהול החנות</span></div>
        <div className="admin-header-actions">
          <Link href="/" className="admin-store-link">לאתר החנות <span aria-hidden="true"><IconFwd /></span></Link>
          <form action="/admin/session" method="post"><input type="hidden" name="operation" value="logout" /><button className="btn btn-line" type="submit">יציאה</button></form>
        </div>
      </header>
      <div className="admin-layout">
        <AdminNavigation key={query}>
          <Link className="admin-nav-overview" href="/admin" prefetch={false} aria-current={overviewView ? "page" : undefined}>
            <span className="admin-nav-icon" aria-hidden="true"><IconHome /></span>{overview.title}
          </Link>
          {toolGroups.map(({ label, Icon: GroupIcon, tools }) => (
            <details key={label} className="admin-nav-group" open={tools.some(tool => tool === query)}>
              <summary><span className="admin-nav-icon"><GroupIcon /></span>{label}<span className="admin-nav-chevron"><IconFwd /></span></summary>
              <div className="admin-nav-children">{tools.map(key =>
                <Link key={key} href={adminUrl(key)} prefetch={false} aria-current={query === key ? "page" : undefined}>
                  {navigationTools[key].title}
                </Link>
              )}</div>
            </details>
          ))}
        </AdminNavigation>
        <section className="admin-main" aria-labelledby="admin-title">
          <header className={categoryView ? "admin-section-heading storefront-category-heading" : "admin-section-heading"}>
            {backHref && <AdminBackLink href={backHref} label={reviewHref ? "חזרה לכל המוצרים" : undefined} />}
            <div className="admin-section-intro">
              <span className="admin-section-icon" aria-hidden="true"><Icon /></span>
              <div className="admin-section-copy">
                <h1 className="k" id="admin-title">{title}</h1>
                {!editing && !manageHref && !reviewHref && <p>{info.description}</p>}
              </div>
              {tab === "heroes" ? !create && store.heroes.length > 0 && (
                <Link href={`${adminUrl("heroes", { edit: "new" })}#hero-editor`} className="btn admin-primary admin-section-action" prefetch={false}>
                  <IconPlus size={16} />{tabs.heroes.create}
                </Link>
              ) : tab && tab !== "sets" && (reviewHref
                ? reviewProduct && !editing && <Link href={`${adminUrl("reviews", { product: reviewProduct.id, edit: "new" })}#review-editor`} className="btn admin-primary admin-section-action" prefetch={false}><IconPlus size={16} />הוספת ביקורת</Link>
                : manageHref
                ? groupProduct && <Link href={`${adminUrl(tab, { edit: "new", manage: group })}#bundle-editor`} className="btn admin-section-action admin-product-create"><IconPlus size={16} />הוספת חבילה</Link>
                : !editing && <Link href={adminUrl(tab, { edit: "new" })} className={`btn admin-section-action ${tab === "bundles" ? "admin-product-create" : "admin-primary"}`}><IconPlus size={16} />{tabs[tab].create}</Link>)}
            </div>
          </header>
          {(tab || colorView) && !editing && !create && !editId && saved === "1" && <p className="admin-feedback admin-list-notice" data-ok="true" role="status">השינויים נשמרו.</p>}
          {supplierView ? <Suspense key={JSON.stringify([params.site, params.view, params.cat, params.item, params.status])}
            fallback={<p className="admin-panel supplier-box" role="status">טוען את נתוני הספק…</p>}>
              <Suppliers params={params} />
            </Suspense> : categoryView
            ? <Suspense fallback={<p role="status">טוען את ספירת המוצרים בקטגוריות…</p>}>
              <StoreCategoryTree placements={store.categoryPlacements} />
            </Suspense>
            : colorView ? <Suspense key={JSON.stringify([params.status, params.page])} fallback={<p role="status">טוען צבעים והצעות…</p>}>
              <ColorReview mappings={store.colorMappings} status={params.status} requestedPage={params.page} />
            </Suspense>
            : quotesView ? <BusinessQuotes requestedPage={params.page} search={params.q} />
            : newProductView ? <NewProductForm categories={storefrontCategories(CATS, store.categoryPlacements)}
              brands={uniqueBrandNames([...BRANDS.map(brand => brand.name), ...catalog.products.flatMap(product => product.brand ? [product.brand] : [])]).sort((a, b) => a.localeCompare(b, "he"))} />
            : !tab ? <StoreOverview store={store} products={catalog.products} />
            : tab === "sets" ? <AdminProductSets settings={store.sets.map(({ offer, ...setting }) => ({ ...setting, price: offer?.price }))} initialId={requestedProduct} />
            : tab === "heroes" ? <HeroManager store={store} categories={catalog.categories} editId={editId} create={create} />
            : manageHref && group ? <>
              <ProductBundles group={group} productId={groupProductId} items={groupBundles} catalog={products} editId={editId} />
              {editing && <section className="admin-panel admin-editor admin-bundle-editor" id="bundle-editor"
                aria-labelledby="bundle-editor-title" tabIndex={-1} key={JSON.stringify([group, editId, create])}>
                <header className="admin-bundle-editor-header">
                  <h2 id="bundle-editor-title">{create ? "חבילה חדשה" : "עריכת חבילה"}</h2>
                  <Link href={manageHref} className="btn btn-line" prefetch={false}>ביטול</Link>
                </header>
                <BundleEditor item={groupBundles.find((item) => item.id === editId)} initialProduct={prefilledProduct} returnTo={manageHref}
                  reservedQuantities={groupBundles.filter((item) => item.id !== editId && item.items.length === 1).map((item) => item.items[0][1])} />
              </section>}
            </>
            : reviewHref && reviewProductId ? <>
              {editing && <section className="admin-panel admin-editor admin-bundle-editor" id="review-editor" aria-labelledby="review-editor-title"
                tabIndex={-1} key={JSON.stringify([reviewProductId, editId, create])}>
                <header className="admin-bundle-editor-header">
                  <h2 id="review-editor-title">{create ? tabs.reviews.create : tabs.reviews.edit}</h2>
                  <Link href={reviewHref} className="btn btn-line" prefetch={false}>ביטול</Link>
                </header>
                <ReviewEditor item={productReviews.find((item) => item.id === editId)} product={reviewProduct} returnTo={reviewHref} />
              </section>}
              <ProductReviewList productId={reviewProductId} product={reviewProduct} items={productReviews} />
            </>
            : editing ? <div className="admin-panel admin-editor" key={JSON.stringify([tab, editId, prefilledProduct])}>
              <ToolEditor tab={tab} store={store} id={editId} productId={prefilledProduct} />
            </div>
            : <ToolList tab={tab} store={store} catalog={products} />}
        </section>
      </div>
    </main>
  );
}

async function StoreCategoryTree({ placements }: { placements: AdminStore["categoryPlacements"] }) {
  const categories = storefrontCategories(CATS, placements);
  const counts = await readCategoryProductCounts().catch(error => {
    console.error("Unable to load admin category product counts.", error);
    return undefined;
  });
  return <StorefrontCategoryCreator categories={categories} counts={counts} showTree />;
}

function StoreOverview({ store, products }: { store: AdminStore; products: Product[] }) {
  const liveBundles = store.bundles.filter((item) => item.active).length;
  const liveHeroes = store.heroes.filter((item) => heroIsPublished(item, store.activeHero)).length;
  return <>
    <section className="admin-overview-metrics" aria-label="מצב החנות">
      <div className="admin-panel admin-metric">
        <span>מוצרים בקטלוג</span><strong>{products.length.toLocaleString("he-IL")}</strong>
      </div>
      <Link href={adminUrl("bundles")} className="admin-panel admin-metric" prefetch={false}>
        <span>באנדלים פעילים</span><strong>{liveBundles}</strong><small>{store.bundles.length - liveBundles} טיוטות</small>
      </Link>
      <Link href={adminUrl("heroes")} className="admin-panel admin-metric" prefetch={false}>
        <span>באנרים בדף הבית</span><strong>{liveHeroes}</strong>
      </Link>
    </section>
    {toolGroups.map(({ label, tools }) => <section key={label} className="admin-overview-group" aria-label={label}>
      <h2>{label}</h2>
      <div className="admin-tool-grid">
        {tools.map((tab) => {
          const { title, description, Icon: ToolIcon } = navigationTools[tab];
          let detail: string = description;
          if (tab === "sets" || tab === "bundles" || tab === "labels" || tab === "reviews" || tab === "heroes") {
            const count = store[tab].length;
            detail = tab === "sets" ? count ? `הגדרות אישיות ל־${count} מוצרים` : "בחירה אוטומטית לכל המוצרים" : `${count} ${count === 1 ? "פריט" : "פריטים"}`;
          }
          return <Link className="admin-panel admin-tool-card" key={tab} href={adminUrl(tab)} prefetch={false}>
            <span className="admin-tool-icon" aria-hidden="true"><ToolIcon /></span>
            <span><strong>{title}</strong><small>{detail}</small></span>
            <span className="admin-tool-arrow" aria-hidden="true"><IconFwd /></span>
          </Link>;
        })}
      </div>
    </section>)}
  </>;
}

type ListItem = { id: string; title: string; note?: ReactNode; status?: string; active?: boolean; href?: string };
type ProductIndex = Map<string, Product>;

function HeroManager({ store, categories, editId, create }: { store: AdminStore; categories: Category[]; editId?: string; create: boolean }) {
  const returnTo = adminUrl("heroes");
  const categoryOptions = categories.map(({ id, name }) => ({ id, name }));
  const editor = (hero?: AdminHero) => (
    <section className="admin-panel admin-editor admin-hero-editor" id="hero-editor" aria-labelledby="hero-editor-title" tabIndex={-1} key={hero?.id ?? "new"}>
      <header className="admin-bundle-editor-header"><h2 id="hero-editor-title">{hero ? tabs.heroes.edit : tabs.heroes.create}</h2></header>
      <AdminHeroEditor hero={hero} published={hero ? heroIsPublished(hero, store.activeHero) : true} categories={categoryOptions} returnTo={returnTo} />
    </section>
  );
  const cards = store.heroes.map((hero) => {
    if (hero.id === editId) return { id: hero.id, content: editor(hero) };
    const published = heroIsPublished(hero, store.activeHero);
    const content = <article className="admin-panel admin-hero-card">
        <div className="admin-hero-files">
          <HeroImagePreview hero={hero} device="desktop" label="תמונה למחשב" />
          <HeroImagePreview hero={hero} device="mobile" label="תמונה למובייל" />
        </div>
        <footer>
          <span className="admin-status" data-active={published}>{published ? "מוצג בדף הבית" : "מוסתר מדף הבית"}</span>
          <div className="admin-row-actions">
            <Link href={`${adminUrl("heroes", { edit: hero.id })}#hero-editor`} className="btn btn-line admin-row-edit" prefetch={false}>
              <IconPencil />עריכת באנר
            </Link>
            {hero.id !== "default" && <AdminRemoveButton section="heroes" id={hero.id} title="הבאנר" />}
          </div>
        </footer>
    </article>;
    return { id: hero.id, content };
  });
  return <div className="admin-hero-list">
    {(create || !store.heroes.length) && editor()}
    {!create && !editId && cards.length > 1
      ? <AdminHeroOrder key={JSON.stringify(cards.map(({ id }) => id))} cards={cards} returnTo={returnTo} />
      : cards.map(({ id, content }) => <Fragment key={id}>{content}</Fragment>)}
  </div>;
}

function HeroImagePreview({ hero, device, label }: { hero: AdminHero; device: HeroDevice; label: string }) {
  const image = hero[device];
  const target = heroImageTarget(hero, device);
  return <div className="admin-hero-preview" data-device={device}>
    <strong>{label}</strong>
    <div className="admin-hero-preview-image">
      {image ? <img src={image.src} alt="" loading="lazy" /> : <span>משתמש בתמונה השנייה</span>}
    </div>
    {image && <p className="admin-hero-preview-target">
      {target?.kind === "link" ? <>קישור <bdi>{target.href}</bdi></>
        : target ? <>{target.kind === "product" ? "מוצר" : "קטגוריה"} <bdi>{target.label}</bdi></>
        : "ללא קישור"}
    </p>}
  </div>;
}

function ToolList({ tab, store, catalog }: { tab: Exclude<Tab, "heroes" | "sets">; store: AdminStore; catalog: ProductIndex }) {
  if (tab === "bundles") return <BundleList bundles={store.bundles} catalog={catalog} />;
  if (tab === "reviews") return <ReviewProductCards reviews={store.reviews} catalog={catalog} />;
  if (tab === "labels") return <LabelList labels={store.labels} catalog={catalog} categories={storefrontCategories(CATS, store.categoryPlacements)} />;
  const product = (id: string) => catalog.get(id)?.name ?? id;
  const rows: ListItem[] = {
    links: () => store.links.map((item) => ({ id: item.id, title: "/s/" + item.slug, note: item.destination, href: "/s/" + item.slug })),
    sales: () => store.sales.map((item) => ({ id: item.id, title: item.title, note: product(item.productId) + " · " + item.quantity + " יח׳", href: item.url })),
  }[tab]();
  return <section className="admin-records" aria-label="פריטים שמורים">
    <h2>פריטים שמורים <span>{rows.length}</span></h2>
    {rows.length ? <ul className="admin-panel admin-record-list">
      {rows.map((item) => <ListRow key={item.id} tab={tab} item={item} />)}
    </ul> : <p className="admin-panel admin-empty">עוד לא נשמרו פריטים בכלי הזה.</p>}
  </section>;
}

function LabelList({ labels, catalog, categories }: { labels: AdminLabel[]; catalog: ProductIndex; categories: Category[] }) {
  return <section className="admin-records admin-labels" aria-labelledby="admin-labels-title">
    <h2 id="admin-labels-title">תוויות שמורות <span>{labels.length}</span></h2>
    {labels.length ? <ul className="admin-label-list">
      {labels.map(label => {
        const product = "productId" in label ? catalog.get(label.productId) : undefined;
        const name = label.scope === "all" ? "כל המוצרים בחנות"
          : label.scope === "categories" ? label.paths.map(path => [
            categories.find(category => category.id === path.parentId)?.name ?? path.parentId, path.sub,
          ].filter(Boolean).join(" / ")).join(" · ")
          : product?.name ?? label.productId;
        const image = product?.imgs?.find(Boolean) ?? product?.choices?.find(choice => choice.image)?.image;
        return <li key={label.id} className="admin-panel admin-label-card">
          <div className="admin-label-product">
            <AdminProductSummary item={{ name, sku: product?.sku, imgs: image ? [image] : [] }}/>
            <span className="badge y product-promo-label admin-label-preview"><bdi>{label.text}</bdi></span>
          </div>
          <div className="admin-row-actions admin-label-actions">
            <Link href={adminUrl("labels", { edit: label.id })} className="btn btn-line" aria-label={`עריכת התווית של ${name}`}>
              <IconPencil/>עריכה
            </Link>
            <AdminRemoveButton section="labels" id={label.id} title={`התווית ״${label.text}״ עבור ${name}`}/>
          </div>
        </li>;
      })}
    </ul> : <p className="admin-panel admin-empty">עדיין אין תוויות מבצע שמורות.</p>}
  </section>;
}

function bundleGroup(bundle: AdminBundle) {
  return bundle.items.length === 1 ? `product:${bundle.items[0][0]}` : `bundle:${bundle.id}`;
}

function productKeywords(product: Product | undefined, id: string) {
  return product ? [product.name, product.sku, ...new Set(product.choices?.map(({ sku }) => sku))].filter(Boolean).join(" ") : id;
}

function ReviewProductCards({ reviews, catalog }: { reviews: AdminReview[]; catalog: ProductIndex }) {
  const groups = new Map<string, { count: number; pending: number }>();
  for (const review of reviews) {
    const group = groups.get(review.productId) ?? { count: 0, pending: 0 };
    group.count++;
    if (reviewAwaitsApproval(review)) group.pending++;
    groups.set(review.productId, group);
  }
  const entries = [...groups].sort(([, a], [, b]) => Number(b.pending > 0) - Number(a.pending > 0)).map(([id, { count, pending }]) => {
    const product = catalog.get(id);
    return {
      id, keywords: productKeywords(product, id),
      card: <Link href={adminUrl("reviews", { product: id })} className="admin-panel admin-review-card" prefetch={false}>
        <div className="admin-review-card-product"><AdminProductSummary item={product ?? { name: id }} /></div>
        <div className="admin-review-card-footer">
          <span>{count === 1 ? "ביקורת אחת" : `${count} ביקורות`}</span>
          {pending > 0 && <span className="admin-review-pending">{pending === 1 ? "אחת ממתינה לאישור" : `${pending} ממתינות לאישור`}</span>}
          <IconFwd />
        </div>
      </Link>,
    };
  });
  return <AdminProductList section="reviews" entries={entries} />;
}

function ProductReviewList({ productId, product, items }: { productId: string; product?: Product; items: AdminReview[] }) {
  return <>
    <PromotionCard name={product?.name ?? productId} product={product}>
      {items.map((item) => {
        const pending = reviewAwaitsApproval(item);
        return <ListRow key={item.id} tab="reviews" editHref={`${adminUrl("reviews", { product: productId, edit: item.id })}#review-editor`}
          primaryAction={pending ? <AdminApproveReviewButton id={item.id} author={item.author} /> : undefined} item={{
            id: item.id, title: item.author, active: item.published,
            status: pending ? "ממתינה לאישור" : item.published ? "פורסמה" : "טיוטה",
            note: <>
              <span className="admin-review-rating"><ReviewStars rating={item.rating} size={15} />{item.source === "customer" && "נשלחה מהאתר"}</span>
              <span className="admin-review-text" dir="auto">{item.text}</span>
            </>,
          }} />;
      })}
    </PromotionCard>
    {!items.length && <p className="admin-panel admin-empty">עדיין אין ביקורות למוצר הזה.</p>}
  </>;
}

function BundleList({ bundles, catalog }: { bundles: AdminBundle[]; catalog: ProductIndex }) {
  const groups = new Map<string, AdminBundle[]>();
  for (const bundle of bundles) {
    const key = bundleGroup(bundle);
    const items = groups.get(key);
    if (items) items.push(bundle);
    else groups.set(key, [bundle]);
  }
  return <AdminProductList section="bundles" entries={Array.from(groups, ([id, items]) => {
    const [bundle] = items;
    const productId = bundle.items.length === 1 ? bundle.items[0][0] : undefined;
    const product = productId ? catalog.get(productId) : undefined;
    const name = product?.name ?? productId ?? "ערכה ממספר מוצרים";
    const relatedIds = new Set(bundle.items.map(([sourceId]) => sourceId));
    const snapshot = bundleGroupSnapshot(items);
    const edit = product && <AdminBundleDialog id={product.id} snapshot={snapshot}
      summary={{ name, sku: product.sku, imgs: product.imgs?.slice(0, 1) }} tiers={[...items].sort((a, b) => a.items[0][1] - b.items[0][1]).map((tier) => ({
        id: tier.id, quantity: tier.items[0][1], total: tier.total ?? (tier.bundleProductId ? catalog.get(tier.bundleProductId)?.price : undefined),
        title: tier.name, bestValue: tier.bestValue, mixedUnits: tier.mixedUnits, active: tier.active,
      }))} />;
    return {
      id,
      keywords: Array.from(relatedIds, (sourceId) => productKeywords(catalog.get(sourceId), sourceId)).join(" "),
      card: <PromotionCard name={name} product={product} actions={<>{edit}
        <AdminRemoveButton section="bundles" id={bundle.id} title={productId ? name : bundle.name} wholeBundle={{ productId, snapshot }} /></>}
        editHref={product ? undefined : adminUrl("bundles", { manage: id, edit: items.length === 1 ? bundle.id : undefined })} />,
    };
  })} />;
}

function ProductBundles({ group, productId, items, catalog, editId }: { group: string; productId?: string; items: AdminBundle[]; catalog: ProductIndex; editId?: string }) {
  const product = productId ? catalog.get(productId) : undefined;
  const sorted = [...items].sort((a, b) => (a.items[0]?.[1] ?? 0) - (b.items[0]?.[1] ?? 0));
  return <>
    <PromotionCard name={product?.name ?? productId ?? "ערכה ממספר מוצרים"} product={product}>
      {sorted.map((item) => {
        const contents = item.items.map(([sourceId, quantity]) => productId ? `${quantity} יחידות` : `${quantity} × ${catalog.get(sourceId)?.name ?? sourceId}`);
        if (item.bundleProductId) contents.push(catalog.get(item.bundleProductId)?.name ?? item.bundleProductId);
        return <PromotionRow key={item.id} section="bundles" item={item} title={item.name}
          note={contents.filter((part) => part !== item.name).join(" · ")} editing={item.id === editId}
          editHref={`${adminUrl("bundles", { edit: item.id, manage: group })}#bundle-editor`} />;
      })}
    </PromotionCard>
    {!sorted.length && <p className="admin-panel admin-empty">אין חבילות למוצר הזה.</p>}
  </>;
}

function PromotionCard({ name, product, editHref, actions, children }: { name: string; product?: Product; editHref?: string; actions?: ReactNode; children?: ReactNode }) {
  const hasDetails = Array.isArray(children) ? children.length > 0 : !!children;
  return <section className="admin-panel admin-promotion-card" aria-label={name}>
    <header className="admin-promotion-card-header" data-has-details={hasDetails}>
      <div className="admin-promotion-card-product"><AdminProductSummary item={{ name, sku: product?.sku, imgs: product?.imgs?.slice(0, 1) }} /></div>
      <div className="admin-promotion-card-actions">
        {editHref && <Link href={editHref} className="btn btn-line admin-promotion-edit" prefetch={false} aria-label={`עריכת ${name}`}>
          <IconPencil />עריכה
        </Link>}
        {actions}
        {product && <Link href={`/p/${encodeURIComponent(product.id)}`} className="btn btn-line" prefetch={false}>לדף המוצר<IconFwd /></Link>}
      </div>
    </header>
    {hasDetails && <ul className="admin-record-list">{children}</ul>}
  </section>;
}

function PromotionRow({ section, item, title, note, editHref, editing, status, removeTitle = title }: {
  section: "bundles" | "offers"; item: { id?: string; total?: number; active: boolean; bestValue?: boolean }; title: string; note?: string; editHref?: string; editing?: boolean; status?: string; removeTitle?: string;
}) {
  return <li className="admin-promotion-row" data-editing={editing}>
    <div className="admin-record-title"><strong dir="auto">{title}</strong>{note && <small dir="auto">{note}</small>}</div>
    <div className="admin-promotion-row-details">
      {item.total !== undefined && <strong className="admin-promotion-row-price"><bdi>{fmt(item.total)}</bdi></strong>}
      <span className="admin-status" data-active={status ? status === "פעיל" : item.active}>{status ?? (item.active ? "פעיל" : "טיוטה")}</span>
      {item.bestValue && <span className="admin-bundle-best-value-status">הכי משתלם</span>}
    </div>
    <div className="admin-row-actions">
      {editHref && <Link href={editHref} className="btn btn-line admin-row-edit" prefetch={false} aria-label={`עריכת ${title}`} aria-current={editing || undefined}><IconPencil />עריכה</Link>}
      {item.id && <AdminRemoveButton section={section} id={item.id} title={removeTitle} />}
    </div>
  </li>;
}

function ListRow({ tab, item, editHref, primaryAction }: { tab: Tab; item: ListItem; editHref?: string; primaryAction?: ReactNode }) {
  return <li className={tab === "reviews" ? "admin-record admin-review-row" : "admin-record"}>
    <div className="admin-record-main">
      <span className="admin-record-title"><strong dir="auto">{item.title}</strong>{item.note && <small dir="auto">{item.note}</small>}</span>
      {item.status && <span className="admin-status" data-active={item.active}>{item.status}</span>}
    </div>
    <div className="admin-row-actions">
      {item.href && <CopyAdminLink href={item.href} />}
      {primaryAction ?? <Link href={editHref ?? adminUrl(tab, { edit: item.id })} className="btn btn-line admin-row-edit" prefetch={false} aria-label={"עריכת " + item.title}>עריכה</Link>}
      <AdminRemoveButton section={tab} id={item.id} title={item.title} />
    </div>
  </li>;
}

function ToolEditor({ tab, store, id, productId }: { tab: Exclude<Tab, "heroes" | "sets">; store: AdminStore; id?: string; productId?: string }) {
  switch (tab) {
    case "bundles": return <BundleEditor item={store.bundles.find((item) => item.id === id)} initialProduct={productId} />;
    case "reviews": return <ReviewEditor item={store.reviews.find((item) => item.id === id)} />;
    case "links": return <LinkEditor item={store.links.find((item) => item.id === id)} />;
    case "sales": return <SaleEditor item={store.sales.find((item) => item.id === id)} />;
    case "labels": return <AdminLabelEditor item={store.labels.find((item) => item.id === id)} categories={storefrontCategories(CATS, store.categoryPlacements)} />;
  }
}


function BundleEditor({ item, initialProduct, returnTo, reservedQuantities }: { item?: AdminBundle; initialProduct?: string; returnTo?: string; reservedQuantities?: number[] }) {
  const singleProduct = item?.items.length === 1 ? item.items[0] : undefined;
  return <AdminForm section="bundles" id={item?.id} returnTo={returnTo}>
    {item && item.items.length > 1 && <p className="admin-hint">הערכה הזו כוללת כמה מוצרים. כדי לעדכן אותה, בחרו מוצר אחד ומחיר כולל.</p>}
    <AdminBundleFields initialId={singleProduct?.[0] ?? initialProduct} reservedQuantities={reservedQuantities}
      initial={item && { title: item.name, quantity: singleProduct?.[1] ?? 2, total: item.total, bestValue: item.bestValue, mixedUnits: item.mixedUnits }} />
    <Check name="active" checked={item?.active ?? true} label="סנכרון ופרסום ב־Shopify בשמירה" />
    <p className="admin-hint">מחיר החבילה חל אוטומטית על כל הצבעים והמידות של המוצר.</p>
  </AdminForm>;
}

function ReviewEditor({ item, product, returnTo }: { item?: AdminReview; product?: Product; returnTo?: string }) {
  return <AdminForm section="reviews" id={item?.id} returnTo={returnTo}>
    {product && !item ? <>
      <input type="hidden" name="productId" value={product.id} />
      <div className="admin-selected-product"><AdminProductSummary item={product} /></div>
    </> : <AdminProductField initialId={item?.productId} />}
    <div className="admin-field-pair">
      <label className="field">שם לתצוגה<input name="author" maxLength={80} defaultValue={item?.author} required /></label>
      <ReviewRatingInput initialRating={item?.rating ?? 5} />
    </div>
    <label className="field">תוכן הביקורת<textarea name="review" rows={4} maxLength={2000} defaultValue={item?.text} required /></label>
    <Check name="published" checked={item?.published} label="פרסום בעמוד המוצר" />
  </AdminForm>;
}

function LinkEditor({ item }: { item?: AdminRedirect }) {
  return <AdminForm section="links" id={item?.id}>
    <label className="field">שם הקישור אחרי ‎/s/‎<input name="slug" dir="ltr" placeholder="winter" maxLength={72} pattern="[a-zA-Z0-9]+([_\-][a-zA-Z0-9]+)*" defaultValue={item?.slug} required /></label>
    <label className="field">יעד הקישור<input name="destination" dir="ltr" placeholder="/offers" maxLength={2048} defaultValue={item?.destination} required /></label>
  </AdminForm>;
}

function SaleEditor({ item }: { item?: AdminSale }) {
  return <AdminForm section="sales" id={item?.id}>
    <label className="field">שם המכירה<input name="title" maxLength={120} defaultValue={item?.title} required /></label>
    <AdminProductField initialId={item?.productId} initialVariant={item?.variantId} variants />
    <div className="admin-field-pair">
      <label className="field">כמות<input type="number" name="quantity" min={1} max={250} defaultValue={item?.quantity ?? 1} required /></label>
      <label className="field">קוד הנחה אופציונלי<input name="code" dir="ltr" maxLength={100} defaultValue={item?.code} /></label>
    </div>
  </AdminForm>;
}

function Check({ name, label, checked }: { name: string; label: string; checked?: boolean }) {
  return <label className="admin-check"><span>{label}</span><input type="checkbox" name={name} defaultChecked={checked} /></label>;
}

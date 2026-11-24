import Link from "next/link";
import { AdminBackLink } from "@/components/AdminBackLink";
import { SupplierDirectory } from "@/components/SupplierDirectory";
import { IconFwd } from "@/components/icons";
import { SupplierPreview } from "@/components/SupplierPreview";
import { SupplierMonitorReports } from "@/components/SupplierMonitorReports";
import { AddSupplier, CatalogList, CategorySetup, PullProgress, RefreshWhileBusy, RemoveSupplier } from "@/components/SupplierCatalog";
import { shopDomain } from "@/lib/shopify/config";
import { manualCollections } from "@/lib/suppliers/shopify";
import { getPreview, pendingCount, previews } from "@/lib/suppliers/storage";
import { MonitorSettings, IgnoreSuggestion } from "@/components/SupplierCatalog";
import { publicationStates } from "@/lib/suppliers/publication";
import { load } from "cheerio";
import { getSite, listSites } from "@/lib/suppliers/sites";
import {
  mappedCollections,
  supplierUrl,
} from "@/lib/suppliers/catalog-model";
import { prices, readCatalogBatch } from "@/lib/suppliers/catalog-batch";
import { hasActiveImports } from "@/lib/suppliers/import-queue";
import { stockUpdateCounts } from "@/lib/suppliers/monitor-report";

type Params = { site?: string; view?: string; cat?: string; page?: string; item?: string; status?: string };
export async function Suppliers({ params = {} }: { params?: Params } = {}) {
  try {
    return await content(params);
  } catch (e) {
    return (
      <p role="alert" className="admin-panel supplier-box">
        {e instanceof Error ? e.message : "טעינת נתוני הספק נכשלה."}
      </p>
    );
  }
}
async function content({ site: domain, view, cat = "", page: pageParam, item, status }: Params) {
  const home = <AdminBackLink href={supplierUrl()} label="חזרה לכל האתרים" />;
  if (view === "add")
    return (
      <>
        {home}
        <AddSupplier />
      </>
    );
  if (!domain) {
    const sites = await listSites();
    const activeRun = sites.some(site => site.state === "queued" || site.state === "running");
    const monitoring = sites.filter(site => site.monitor_hours > 0);
    const nextAt = Math.min(...monitoring
      .map(site => Date.parse(site.next_monitor_at ?? "")).filter(Number.isFinite));
    const [counts, stockCounts] = await Promise.all([
      Promise.all(sites.map(site => pendingCount(site.domain))),
      sites.length ? stockUpdateCounts().catch(() => null) : new Map<string, number>(),
    ]);
    return (
      <>
        <RefreshWhileBusy active={activeRun || monitoring.length > 0 || counts.some(Boolean)}
          interval={activeRun ? 4000 : 60000} nextAt={Number.isFinite(nextAt) ? nextAt : undefined} />
        <SupplierDirectory entries={sites.map((site, i) => {
          const busy = site.state === "queued" || site.state === "running";
          const progress = busy ? {
            phase: site.phase, state: site.state, pull_checked: site.pull_checked, pull_total: site.pull_total,
            pull_started_at: site.pull_started_at, pull_sampled_at: site.pull_sampled_at,
            attempts: site.attempts, cursor_page: site.cursor_page, page_count: site.page_count,
          } : undefined;
          const automatic = site.run_kind === "monitor";
          return {
            domain: site.domain,
            card: <article className="supplier-site-card" aria-label={site.domain}>
              <header className="supplier-site-identity">
                <span className="supplier-site-mark" aria-hidden="true">{site.domain.replace(/^www\./,"").charAt(0).toUpperCase()}</span>
                <div>
                  <h3><bdi dir="ltr">{site.domain}</bdi></h3>
                  <small>{site.discovered_at ? site.categories.length + " קטגוריות" : "טרם נסרקו קטגוריות"}</small>
                </div>
              </header>
              {progress && !automatic && <PullProgress site={progress} />}
              {site.last_error && <p className="supplier-site-error">{site.last_error}</p>}
              <MonitorSettings domain={site.domain} hours={site.monitor_hours} ready={!!site.baseline_at}
                last={automatic && site.state === "complete" ? site.finished_at ?? site.last_monitor_ok : site.last_monitor_ok}
                next={site.next_monitor_at} fullCatalog={site.pull_all} progress={automatic ? progress : undefined} />
              {automatic && !!site.issues.length && <Link className="supplier-monitor-issues" href={supplierUrl(site.domain, "catalog")}>
                {site.issues.length} מוצרים דורשים בדיקה <IconFwd/>
              </Link>}
              {(site.baseline_at || counts[i] > 0 || !!stockCounts?.get(site.domain)) &&
                <SupplierMonitorReports domain={site.domain} newCount={counts[i]}
                  stockCount={stockCounts ? stockCounts.get(site.domain) ?? 0 : null} />}
              <footer className="supplier-site-actions">
                <Link className="btn supplier-site-open" href={supplierUrl(site.domain, "catalog")}>
                  פתח קטלוג <IconFwd/>
                </Link>
                <Link className="btn btn-line" href={supplierUrl(site.domain, "catalog", { status: "imported" })} prefetch={false}>
                  מוצרים שיובאו
                </Link>
                <Link className="btn btn-line" href={supplierUrl(site.domain, "setup")}>
                  בחירת קטגוריות
                </Link>
                <RemoveSupplier domain={site.domain} pulling={busy} />
              </footer>
            </article>,
          };
        })}/>
      </>
    );
  }
  const site = await getSite(domain);
  const heading = <h2><bdi>{site.domain}</bdi></h2>;
  const importedOnly = status === "imported";
  if (view === "review") {
    const page = Math.max(1, Math.floor(Number(pageParam) || 1));
    const rows = await previews(domain,{review_state:"eq.pending",shopify_product_id:"is.null",order:"source_id",limit:"13",offset:String((page-1)*12)});
    return <section className="admin-panel supplier-box">{home}{heading}<h2>מוצרים חדשים לבדיקה</h2>
      {!rows.length && <p>אין הצעות בעמוד זה.</p>}
      {rows.slice(0,12).map(r=><article key={r.source_id} className="supplier-catalog-row">
        <div className="supplier-thumb"><img src={r.snapshot.images[0]} alt="" /></div>
        <div><strong>{r.snapshot.title}</strong><small>{r.snapshot.category}</small></div>
        <Link className="btn admin-primary" href={supplierUrl(domain,"product",{item:r.source_id})}>תצוגה מקדימה וייבוא כטיוטה</Link>
        <IgnoreSuggestion domain={domain} id={r.source_id} />
      </article>)}
      <nav className="supplier-toolbar">{page>1 && <Link href={supplierUrl(domain,"review",{page:String(page-1)})}>הקודם</Link>}
        {rows.length>12 && <Link href={supplierUrl(domain,"review",{page:String(page+1)})}>הבא</Link>}</nav>
    </section>;
  }
  if (view === "setup") {
    const collections = await manualCollections();
    return (
      <>
        <div className="admin-section-heading">{home}{heading}</div>
        <CategorySetup
          key={site.domain + site.discovered_at}
          site={site}
          collections={collections.map(({ id, title }) => ({ id, title }))}
        />
      </>
    );
  }
  if (view === "product" && item && /^\d+$/.test(item)) {
    const [row, collections] = await Promise.all([getPreview(domain, item), manualCollections()]);
    if (!row) throw new Error("המוצר לא נמצא בקטלוג הספק.");
    const gid = row.shopify_product_id;
    const [state] = gid ? await publicationStates([gid]) : [];
    return (
      <>
        <div className="admin-section-heading">
          <div className="supplier-toolbar">
            <AdminBackLink
              href={supplierUrl(domain, "catalog", { cat, page: pageParam || "1", ...(importedOnly ? { status } : {}) }) + "#catalog-item-" + item}
              label={importedOnly ? "חזרה למוצרים שיובאו" : "חזרה לקטלוג"}
            />
            {home}
          </div>
          {heading}
        </div>
        <SupplierPreview
          key={domain + item}
          id={item}
          model={row.snapshot.title}
          domain={domain}
          row={{
            snapshot: row.snapshot,
            revision: row.revision,
            scanned_at: row.scanned_at,
            verified_at: row.verified_at,
          }}
          selected={gid ? row.collection_ids : mappedCollections(row.category_ids, site)}
          collections={collections.map(({ id, title }) => ({ id, title }))}
          draftUrl={gid ? `https://${shopDomain()}/admin/products/${gid.split("/").pop()}` : undefined}
          canPublish={
            !!state && ["ACTIVE", "DRAFT"].includes(state.status) && !(state.status === "ACTIVE" && state.onSite)
          }
          siteUrl={
            state?.status === "ACTIVE" && state.onSite ? "/p/" + encodeURIComponent(state.handle) : undefined
          }
          scanError={row.scan_error}
          finalPrices={Object.fromEntries(prices(row, site).map((v) => [v.id, v.price]))}
        />
      </>
    );
  }
  const requestedPage = Number(pageParam);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const [initial, importing] = await Promise.all([
    readCatalogBatch(site, cat, 1, importedOnly),
    importedOnly ? hasActiveImports(site.domain) : false,
  ]);
  return (
      <CatalogList
        key={domain + ":" + cat + ":" + page + ":" + importedOnly}
        site={{...site, issues:Array.from(new Map(site.issues.map(i=>[i.id,{...i,title:load(i.title,null,false).text()}])).values())}}
        initial={initial}
        cat={cat}
        page={page}
        importedOnly={importedOnly}
        importing={importing}
      />
  );
}

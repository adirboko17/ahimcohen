"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { IconCheck, IconFilter, IconFwd, IconPencil, IconTrash } from "./icons";
import { AdminBackLink } from "./AdminBackLink";
import { useSupplierFeed } from "./useSupplierFeed";
import {
  categoryPath,
  descendants,
  monitorIntervals,
  pullProgress,
  suggestedMapping,
  supplierUrl,
  type Site,
  type CatalogBatch,
  type CatalogItem,
} from "@/lib/suppliers/catalog-model";

type Collection = { id: string; title: string };
function useAction(domain?: string) {
  const router = useRouter(),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState<{ message: string; ok: boolean } | null>(null);
  async function run(action: string, data = new FormData(), next?: (reply: { domain?: string }) => void) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      data.set("action", action);
      if (domain) data.set("domain", domain);
      const res = await fetch("/admin/suppliers", { method: "POST", body: data }),
        reply = await res.json();
      if (!res.ok) throw new Error(reply.message);
      setNotice({ message: reply.message, ok: true });
      if (next) next(reply);
      router.refresh();
    } catch (e) {
      setNotice({ message: e instanceof Error ? e.message : "החיבור נקטע.", ok: false });
    } finally {
      setBusy(false);
    }
  }
  return {
    router,
    busy,
    run,
    feedback: notice ? (
      <p role="status" className="admin-feedback" data-ok={notice.ok}>
        {notice.message}
      </p>
    ) : null,
  };
}
export function RemoveSupplier({ domain, pulling }: { domain: string; pulling: boolean }) {
  const action = useAction(domain);
  return (
    <div className="supplier-remove-action">
      <button type="button" className="btn supplier-remove" disabled={action.busy} title={"הסר את " + domain + " מהרשימה"}
        aria-label={"הסר את " + domain + " מהרשימה"}
        onClick={() => {
          const note = pulling ? "\nמשיכת הקטלוג הפעילה תיעצר." : "";
          if (window.confirm("להסיר את " + domain + " מרשימת האתרים?" + note +
            "\nניתן להוסיף את האתר שוב. מוצרים שכבר יובאו לשופיפיי ותור הייבוא לטיוטות יישמרו."))
            void action.run("remove");
        }}>
        {action.busy ? "מסיר…" : <IconTrash/>}
      </button>
      {action.feedback}
    </div>
  );
}
export function MonitorSettings({ domain, hours, ready, last, next, fullCatalog }: {
  domain:string; hours:number; ready:boolean; last:string|null; next:string|null; fullCatalog:boolean;
}) {
  const action = useAction(domain);
  const frequency = (h:number) => h === 0 ? "כבוי" : h === 24 ? "פעם ביום" : "יש לעדכן תדירות";
  const date = (s:string) => new Intl.DateTimeFormat("he-IL",{timeZone:"Asia/Jerusalem",day:"numeric",month:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(s));
  return <details className="supplier-site-monitor">
    <summary><span>מעקב אוטומטי</span><span className="supplier-monitor-state" data-active={hours > 0}>{frequency(hours)}</span></summary>
    <form onSubmit={e => { e.preventDefault(); void action.run("monitor",new FormData(e.currentTarget)); }}>
    <label>תדירות בדיקה
      <select name="hours" key={hours} defaultValue={hours > 0 ? 24 : 0} disabled={!ready && !hours}>
        {monitorIntervals.map(h => <option key={h} value={h}>{frequency(h)}</option>)}
      </select>
    </label>
    {ready || hours ? <button className="btn btn-line" disabled={action.busy}>שמור תדירות</button> :
      <small>המעקב זמין אחרי משיכת קטלוג ראשונה שהושלמה בהצלחה.</small>}
    {ready && <small>מוצרים חדשים נבדקים {fullCatalog ? "בכל הקטלוג" : "בקטגוריות שנבחרו למשיכה"}</small>}
    {last && <small>בדיקה מוצלחת אחרונה · {date(last)}</small>}
    {next && <small>הבדיקה הבאה · {date(next)}</small>}
    {action.feedback}
    </form>
  </details>;
}
export function IgnoreSuggestion({domain,id}:{domain:string;id:string}) {
  const action=useAction(domain);
  return <div><button className="btn btn-line" disabled={action.busy} onClick={()=>{
    const f=new FormData(); f.set("id",id); void action.run("ignore",f);
  }}>התעלם</button>{action.feedback}</div>;
}

export function RefreshWhileBusy({ active, interval = 4000 }: { active: boolean; interval?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), interval);
    return () => clearInterval(timer);
  }, [active, interval, router]);
  return null;
}

type PullStatus = Pick<Site, "phase" | "state" | "pull_checked" | "pull_total" | "pull_started_at" | "pull_sampled_at" | "attempts" | "cursor_page" | "page_count">;
export function PullProgress({ site }: { site: PullStatus }) {
  if (site.phase === "linked" || site.phase === "index") return <div className="supplier-pull-progress">
    <strong>{site.phase === "linked" ? "בודק זמינות למוצרים המקושרים לשופיפיי…" : "מאתר מוצרים באוספים שנבחרו…"}</strong>
    <progress aria-label="התקדמות הסריקה" />
  </div>;
  const { percent, secondsLeft } = pullProgress(site);
  const count = site.pull_total !== null
    ? `נבדקו ${site.pull_checked} מתוך ${site.pull_total} מוצרים`
    : `נבדקו ${site.pull_checked} מוצרים` + (site.page_count ? ` · עמוד ${site.cursor_page} מתוך ${site.page_count}` : "");
  const time = secondsLeft == null ? null : secondsLeft < 60
    ? "פחות מדקה לסיום" : `זמן משוער לסיום כ־${Math.ceil(secondsLeft / 60)} דקות`;
  const detail = site.attempts > 0 && site.state === "queued" ? "ממתין לניסיון חוזר"
    : time ?? (site.pull_checked === 0 && site.state === "queued" ? "ממתין לתחילת המשיכה"
      : site.pull_total === null && site.pull_checked > 0 ? "מספר המוצרים הכולל עדיין לא ידוע"
      : "מחשב זמן משוער לסיום…");
  return (
    <div className="supplier-pull-progress">
      <strong>משיכת מוצרים{percent !== null && ` · ${site.pull_total === null ? "כ־" : ""}${percent}%`}</strong>
      <progress aria-label="התקדמות משיכת המוצרים" value={percent ?? undefined} max={100} />
      <small role="status">{count} · {detail}</small>
    </div>
  );
}
export function AddSupplier() {
  const action = useAction();
  return (
    <form
      className="admin-panel supplier-box"
      onSubmit={(e) => {
        e.preventDefault();
        void action.run("discover", new FormData(e.currentTarget), (r) =>
          action.router.push(supplierUrl(r.domain, "setup")),
        );
      }}
    >
      <h2>הוסף אתר חדש</h2>
      <label>
        דומיין הספק
        <input name="domain" dir="ltr" autoComplete="off" placeholder="redback.co.il" required />
      </label>
      <small>אפשר לסרוק חנויות Shopify ו־WooCommerce עם קטלוג ציבורי.</small>
      <button className="btn admin-primary" disabled={action.busy}>
        {action.busy ? "מאתר קטגוריות…" : "סרוק"}
      </button>
      {action.busy && <progress className="supplier-discovery" aria-label="מאתר קטגוריות באתר הספק" />}
      {action.feedback}
    </form>
  );
}
export function CategorySetup({ site, collections }: { site: Site; collections: Collection[] }) {
  const action = useAction(site.domain);
  const pulling = site.state === "queued" || site.state === "running";
  const [all, setAll] = useState(site.pull_all),
    [picked, setPicked] = useState(site.selection);
  const [search, setSearch] = useState("");
  const [mapping, setMapping] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(
      site.categories.map((c) => [c.id, site.mappings[c.id] ?? suggestedMapping(c.name, collections)]),
    ),
  );
  const included = new Set(descendants(picked, site.categories));
  function toggle(id: string, enabled: boolean) {
    const next = new Set(included),
      children = descendants([id], site.categories);
    for (const child of children)
      if (enabled) next.add(child);
      else next.delete(child);
    // A deselected descendant must not be selected again through a checked parent.
    if (!enabled) for (const parent of categoryPath(id, site.categories)) next.delete(parent.id);
    setPicked([...next]);
  }
  const sorted = [...site.categories].sort((a, b) =>
    categoryPath(a.id, site.categories)
      .map((c) => c.name)
      .join("/")
      .localeCompare(
        categoryPath(b.id, site.categories)
          .map((c) => c.name)
          .join("/"),
        "he",
      ),
  );
  return (
    <section className="admin-panel supplier-box">
      <RefreshWhileBusy active={pulling} />
      {pulling && <PullProgress site={site} />}
      <div className="supplier-toolbar">
        <h2>בחירת קטגוריות</h2>
        <button className="btn btn-line" disabled={action.busy} onClick={() => action.run("discover")}>
          {action.busy ? "סורק…" : "סריקה מחדש"}
        </button>
      </div>
      <label className="supplier-check">
        <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
        משוך את כל הקטלוג
      </label>
      <p>בחירה בקטגוריה כוללת את תתי־הקטגוריות שלה. אפשר לשנות את אוספי היעד המוצעים לפני המשיכה.</p>
      <label>
        חיפוש קטגוריה
        <input
          type="search"
          placeholder="שם קטגוריה או תת־קטגוריה"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <div className="supplier-category-list">
        {sorted
          .filter((c) =>
            categoryPath(c.id, site.categories).some((p) =>
              p.name.toLowerCase().includes(search.trim().toLowerCase()),
            ),
          )
          .map((c) => {
            const path = categoryPath(c.id, site.categories);
            return (
              <div key={c.id} className="supplier-category-row">
                <label
                  className="supplier-check"
                  style={{ paddingInlineStart: Math.min(4, path.length - 1) * 18 }}
                >
                  <input
                    type="checkbox"
                    disabled={all}
                    checked={all || included.has(c.id)}
                    onChange={(e) => toggle(c.id, e.target.checked)}
                  />
                  <span>
                    {path.length > 1 ? "↳ " : ""}
                    {c.name} {c.count >= 0 && <small>({c.count})</small>}
                  </span>
                </label>
                <select
                  aria-label={"אוסף יעד עבור " + c.name}
                  value={mapping[c.id]?.[0] || ""}
                  onChange={(e) => setMapping({ ...mapping, [c.id]: e.target.value ? [e.target.value] : [] })}
                >
                  <option value="">לפי קטגוריית האב או בחירה לפני הייבוא</option>
                  {collections.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
      </div>
      <div className="supplier-toolbar">
        <button
          className="btn btn-line"
          disabled={action.busy || !site.discovered_at}
          onClick={() => {
            const f = new FormData();
            f.set("mappings", JSON.stringify(mapping));
            void action.run("map", f);
          }}
        >
          שמור התאמות
        </button>
        <button
          className="btn admin-primary"
          disabled={
            action.busy ||
            (!all && !picked.length) ||
            !site.discovered_at ||
            ["queued", "running"].includes(site.state)
          }
          onClick={() => {
            const f = new FormData();
            f.set("all", String(all));
            picked.forEach((id) => f.append("category", id));
            f.set("mappings", JSON.stringify(mapping));
            void action.run("pull", f, () => action.router.push(supplierUrl(site.domain, "catalog")));
          }}
        >
          {all ? "משוך את כל המוצרים" : "משוך מוצרים מהקטגוריות שנבחרו"}
        </button>
      </div>
      {action.feedback}
    </section>
  );
}
function ReviewIssue({site,issue,image,loading,disabled}:{
  site:Site; issue:Site["issues"][number]; image?:string; loading:boolean; disabled:boolean;
}) {
  const action=useAction(site.domain);
  const [failedImage,setFailedImage]=useState("");
  const explanations: Record<string,string> = {
    "ערך צבע או מידה אינו חד־משמעי.": "הספק מציג וריאציה בלי צבע או מידה ברורים. אי אפשר לקבוע לאיזה שילוב שייך המלאי.",
    "אפשרויות המוצר אינן יוצרות שילובים ייחודיים.": "רשימת הצבעים והמידות כוללת שילובים כפולים או חסרים. נדרש פירוט תקין מהספק כדי לשייך את המלאי.",
    "סוג המוצר אינו מוצר רגיל או מוצר עם וריאציות.": "סוג המוצר הזה דורש טיפול נפרד. הייבוא האוטומטי תומך במוצרים רגילים ובמוצרים עם וריאציות.",
  };
  function decide(choice:"add"|"remove") {
    const form=new FormData();
    form.set("id",issue.id);
    form.set("run",site.pull_started_at || "");
    void action.run("issue-"+choice,form);
  }
  return <li className="supplier-issue">
    <div className="supplier-issue-summary">
      <div className="supplier-issue-photo">
        {image && image !== failedImage
          ? <img src={image} alt={issue.title} width={80} height={80} loading="lazy" referrerPolicy="no-referrer"
              onError={()=>setFailedImage(image)}/>
          : <span>{loading ? "טוען תמונה…" : "אין תמונה זמינה"}</span>}
      </div>
      <div><strong>{issue.title}</strong><p>{explanations[issue.message] || issue.message}</p></div>
    </div>
    <div className="supplier-issue-actions">
      <button className="btn btn-line" disabled={disabled || action.busy} onClick={()=>decide("add")}>בדוק והוסף לקטלוג</button>
      <button className="btn btn-line supplier-remove" disabled={disabled || action.busy} onClick={()=>decide("remove")}>הסר מקטלוג הספק</button>
      {site.platform === "woo" && <a href={`https://${site.domain}/?post_type=product&p=${encodeURIComponent(issue.id)}`} target="_blank" rel="noreferrer">בדף הספק ↗</a>}
    </div>
    {action.busy && <small role="status">מעדכן…</small>}{action.feedback}
  </li>;
}
function ReviewList({site,disabled}:{site:Site;disabled:boolean}) {
  const missing = site.issues.filter(issue => !issue.image).map(issue => issue.id).join(",");
  const [images,setImages] = useState<Record<string,string>>({});
  const [status,setStatus] = useState<"loading"|"error"|"done">("loading");
  const [attempt,setAttempt] = useState(0);
  useEffect(() => {
    if (!missing) return;
    const controller = new AbortController();
    async function load() {
      const ids = missing.split(",");
      setStatus("loading");
      for (let start=0; start<ids.length; start+=50) {
        const form = new FormData();
        form.set("action","issue-images");
        form.set("domain",site.domain);
        ids.slice(start,start+50).forEach(id => form.append("item",id));
        const response = await fetch("/admin/suppliers",{method:"POST",body:form,signal:controller.signal});
        if (!response.ok) throw new Error();
        const result = await response.json();
        if (controller.signal.aborted) return;
        setImages(previous => ({...previous,...result.images}));
      }
      setStatus("done");
    }
    void load().catch(() => { if (!controller.signal.aborted) setStatus("error"); });
    return () => controller.abort();
  },[site.domain,missing,attempt]);
  return <>
    {missing && status === "error" && <p role="status">טעינת התמונות מהספק נכשלה.{" "}
      <button className="btn btn-line" onClick={()=>setAttempt(n=>n+1)}>נסה שוב</button></p>}
    <ul className="supplier-issues">{site.issues.map(issue =>
      <ReviewIssue key={issue.id} site={site} issue={issue} disabled={disabled}
        image={issue.image || images[issue.id]} loading={!!missing && status === "loading"}/>)}</ul>
  </>;
}
function CatalogIssues({site,disabled}:{site:Site;disabled:boolean}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const [open,setOpen]=useState(false);
  return <>
    {!!site.issues.length && <button className="supplier-review-trigger" onClick={()=>{dialog.current?.showModal();setOpen(true);}}>
      <span className="supplier-review-count">{site.issues.length}</span>מוצרים דורשים בדיקה <span aria-hidden="true">←</span>
    </button>}
    <dialog ref={dialog} onClose={()=>setOpen(false)} className="supplier-dialog" aria-labelledby="supplier-review-title">
      <header><h2 id="supplier-review-title">מוצרים שדורשים בדיקה</h2>
        <button className="btn btn-line" onClick={()=>dialog.current?.close()}>סגור</button></header>
      <p>לכל מוצר מוצגת סיבת העיכוב. אפשר לסרוק אותו שוב ולהוסיף לקטלוג אם הבדיקה מצליחה, או להסיר אותו מהקטלוג של הספק.</p>
      {disabled && <p role="status">ההחלטות זמינות בסיום המשיכה הנוכחית.</p>}
      {site.issues.length ? open && <ReviewList key={site.domain} site={site} disabled={disabled}/> :
        <p role="status">כל המוצרים ברשימה טופלו.</p>}
    </dialog>
  </>;
}
function SupplierPricing({site}:{site:Site}) {
  const action=useAction(site.domain);
  const [percent,setPercent]=useState(String(site.percent));
  const sample=Number(percent);
  return <form className="supplier-pricing" onSubmit={e=>{
    e.preventDefault();void action.run("percent",new FormData(e.currentTarget));
  }}>
    <small>השינוי חל בייבוא הבא. מחיר ידני למוצר מקבל עדיפות.</small>
    <div className="supplier-pricing-controls">
      <label htmlFor="supplier-percent">שינוי באחוזים</label>
      <div className="supplier-percent-field"><input id="supplier-percent" name="value" type="number" dir="ltr"
        min="-100" step="0.01" required value={percent} onChange={e=>setPercent(e.target.value)}/><span aria-hidden="true">%</span></div>
      <button className="btn btn-line" disabled={action.busy}>שמור</button>
    </div>
    {percent.trim() && Number.isFinite(sample) && sample >= -100 &&
      <small>לדוגמה, מוצר במחיר מקור של 100 ₪ יימכר ב־{priceRange(100+sample,100+sample,"ILS")}.</small>}
    {action.feedback}
  </form>;
}
function priceRange(min: number | null, max: number | null, currency: string) {
  if (min === null || max === null) return "נדרש מחיר ידני";
  const format = new Intl.NumberFormat("he-IL", { style: "currency", currency });
  return min === max ? format.format(min) : format.format(min) + " – " + format.format(max);
}

function CatalogProductActions({ domain, item, href }: { domain: string; item: CatalogItem; href: string }) {
  const action = useAction(domain);
  function removeFromSite() {
    if (!window.confirm(`להסיר את „${item.title}” מהאתר?\nהמוצר יישאר ב־Shopify ותוכלו לפרסם אותו שוב.`)) return;
    const form = new FormData();
    form.set("id", item.id);
    form.set("revision", item.revision);
    void action.run("unpublish", form);
  }
  return <>
    <footer className="catalog-product-actions">
      <Link className="catalog-product-link" href={href}>
        {item.linked ? "פרטי המוצר" : "פרטים וייבוא"} <IconFwd/>
      </Link>
      {item.siteUrl && <button type="button" className="btn catalog-product-remove" disabled={action.busy}
        aria-label={"הסר מהאתר · " + item.title} onClick={removeFromSite}>
        <IconTrash/> {action.busy ? "מסיר…" : "הסר מהאתר"}
      </button>}
    </footer>
    {action.feedback}
  </>;
}

export function CatalogList({
  site,
  initial,
  cat,
  page,
  importedOnly,
  importing,
}: {
  site: Site;
  initial: CatalogBatch;
  cat: string;
  page: number;
  importedOnly: boolean;
  importing: boolean;
}) {
  const feed = useSupplierFeed(site.domain, cat, initial, page, importedOnly);
  const statusParams: Record<string, string> = importedOnly ? { status: "imported" } : {};
  const pages = new Map<string,number>();
  const items = feed.batches.flatMap((batch,index) => batch.items.filter(item => {
    if (pages.has(item.id)) return false;
    pages.set(item.id,index + 1);
    return true;
  }));
  const action = useAction(site.domain),
    [checked, setChecked] = useState<string[]>([]);
  const [scope,setScope] = useState<"selected"|"all">("selected");
  const confirmPublish = useRef<HTMLDialogElement>(null);
  const pulling = site.state === "queued" || site.state === "running";
  const pending = items.some((i) => ["running", "queued"].includes(i.task || ""));
  const issues = new Set(site.issues.map(issue => issue.id));
  const enabled = new Set(items
    .filter(i => i.canPublish && !i.scanError && !issues.has(i.id) && !["running","queued"].includes(i.task || ""))
    .map(i => i.id));
  const selected = checked.filter(id => enabled.has(id));
  const selection = new Set(selected);
  const selectedDrafts = items.filter(i => selection.has(i.id) && !i.linked).map(i => i.id);
  const scopeLabel = scope === "all" ? (cat ? "כל הקטגוריה" : "כל הקטלוג") : `${selected.length} מוצרים שסומנו`;
  const scopeUnavailable = scope === "all" && (pulling || !items.length);
  function submitBatch(intent:"draft"|"publish") {
    const f=new FormData();
    f.set("intent",intent);
    if (scope === "all") { f.set("scope","all"); f.set("category",cat); }
    else (intent === "publish" ? selected : selectedDrafts).forEach(id=>f.append("item",id));
    confirmPublish.current?.close();
    void action.run("batch",f,()=>setChecked([]));
  }
  const paths = useMemo(() => new Map(site.categories.map(c => [
    c.id, categoryPath(c.id,site.categories).map(parent => parent.name).join(" › "),
  ])),[site.categories]);
  const path = (id: string) => paths.get(id) || "";
  return (
    <section className="supplier-catalog">
      <RefreshWhileBusy active={(pulling || importing || pending) && !feed.loading} />
      <div className="admin-panel supplier-box catalog-overview">
        <AdminBackLink href={supplierUrl()} label="חזרה לכל האתרים" />
        <div className="catalog-identity">
          <span className="supplier-site-mark" aria-hidden="true">{site.domain.replace(/^www\./,"").charAt(0).toUpperCase()}</span>
          <div className="catalog-identity-copy">
            <h2><bdi dir="ltr">{site.domain}</bdi></h2>
            {site.state === "complete" && <p className="catalog-complete" role="status"><IconCheck/>המשיכה הושלמה · נשמרו {site.pulled} מוצרים</p>}
            {site.state === "failed" && <p role="status">המשיכה נעצרה · נבדקו {site.pull_checked} מוצרים</p>}
          </div>
          <Link className="btn btn-line" href={supplierUrl(site.domain, "setup")}>
            <IconFilter/>קטגוריות ומשיכה
          </Link>
        </div>
        {pulling && <PullProgress site={site} />}
        {site.last_error && <p role="alert">{site.last_error}</p>}
        <div className="catalog-settings">
          <details className="catalog-pricing-details">
            <summary><IconPencil/>תמחור הספק <bdi>{site.percent > 0 ? "+" : ""}{site.percent}%</bdi></summary>
            <SupplierPricing site={site} />
          </details>
          <CatalogIssues site={site} disabled={pulling}/>
        </div>
      </div>
      <div className="catalog-workspace supplier-box">
        <div className="catalog-list-heading">
          <h2>מוצרי הקטלוג</h2>
          <label className="catalog-category">
            <IconFilter/><span>קטגוריה</span>
            <select
              value={cat}
              onChange={(e) => action.router.push(supplierUrl(site.domain, "catalog", { ...statusParams, cat: e.target.value }))}
            >
              <option value="">כל המוצרים</option>
              {site.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {path(c.id)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <nav className="catalog-status-filter" aria-label="סינון לפי מצב ייבוא">
          <Link className="btn btn-line" aria-current={!importedOnly ? "page" : undefined} prefetch={false}
            href={supplierUrl(site.domain, "catalog", { cat })}>כל מוצרי הקטלוג</Link>
          <Link className="btn btn-line" aria-current={importedOnly ? "page" : undefined} prefetch={false}
            href={supplierUrl(site.domain, "catalog", { cat, status: "imported" })}>מוצרים שיובאו</Link>
        </nav>
        {importing && <p role="status" className="catalog-import-progress">הייבוא מתבצע. הרשימה מתעדכנת אוטומטית.</p>}
        {!importedOnly && <>
          <div className="supplier-batch-bar">
            <label className="supplier-check">
              <input
                type="checkbox"
                checked={!!enabled.size && selected.length === enabled.size}
                disabled={!enabled.size}
                ref={input => { if (input) input.indeterminate = selected.length > 0 && selected.length < enabled.size; }}
                onChange={(e) => {setScope("selected");setChecked(e.target.checked ? [...enabled] : []);}}
              />
              בחר את המוצרים שנטענו
            </label>
            <label>
              <select aria-label="הפעל פעולה על" value={scope} onChange={e=>setScope(e.target.value === "all" ? "all" : "selected")}>
                <option value="selected">המוצרים שסומנו ({selected.length})</option>
                <option value="all">{cat ? "כל המוצרים בקטגוריה" : "כל המוצרים בקטלוג"}</option>
              </select>
            </label>
            <div className="supplier-batch-buttons">
              <button className="btn admin-primary" disabled={action.busy || scopeUnavailable || scope === "selected" && !selected.length}
                onClick={()=>confirmPublish.current?.showModal()}>פרסם באתר</button>
              <button className="btn btn-line" disabled={action.busy || scopeUnavailable || scope === "selected" && !selectedDrafts.length}
                onClick={()=>submitBatch("draft")}>ייבא כטיוטות</button>
            </div>
          </div>
          <dialog className="supplier-dialog supplier-publish-dialog" ref={confirmPublish} aria-labelledby="supplier-publish-title">
            <header><h2 id="supplier-publish-title">פרסום באתר</h2></header>
            <p><strong>{scopeLabel}</strong> מתוך <bdi>{site.domain}</bdi>{cat ? " · "+path(cat) : ""}</p>
            <p>המוצרים המתאימים יעלו למכירה במחירים שהוגדרו, לאחר אימות התמונות, השיוך לאוספים והזמינות לפי צבע ומידה.</p>
            <div className="supplier-batch-buttons">
              <button autoFocus className="btn btn-line" onClick={()=>confirmPublish.current?.close()}>ביטול</button>
              <button className="btn admin-primary" onClick={()=>submitBatch("publish")}>אישור פרסום באתר</button>
            </div>
          </dialog>
          {action.feedback}
        </>}
        {!items.length && (
          <p className="supplier-sites-empty">
            {importedOnly
              ? cat ? "אין עדיין מוצרים שיובאו בקטגוריה הזו." : "אין עדיין מוצרים שיובאו מהספק הזה."
              : pulling
              ? "המוצרים יופיעו כאן עם התקדמות המשיכה."
              : "אין מוצרים בתצוגה זו. בחרו קטגוריות למשיכה או שנו את הסינון."}
          </p>
        )}
        <div className="catalog-product-grid">{items.map((i) => {
          const productPage = pages.get(i.id)!;
          const href = supplierUrl(site.domain, "product", {...statusParams,item:i.id,cat,page:String(productPage)});
          const categories = i.categories.map(path).filter(Boolean).join(" · ");
          const status = i.scanError || (i.task === "failed" ? i.error || "הפעולה נכשלה"
            : i.task === "queued" || i.task === "running" ? (i.intent === "publish" ? "בתור לפרסום באתר" : "בתור לייבוא כטיוטה") : "");
          return <article key={i.id} id={"catalog-item-" + i.id} className="catalog-product" data-catalog-page={productPage} data-selected={selection.has(i.id)}>
            <div className="catalog-photo">
              <Link href={href} prefetch={false} aria-label={"פרטי " + i.title}>
                {i.image ? <img loading="lazy" src={i.image} alt=""/> : <span>אין תמונת מוצר</span>}
              </Link>
              {!importedOnly && <label className="catalog-product-select">
              <input
                aria-label={"בחר " + i.title}
                type="checkbox"
                disabled={!enabled.has(i.id)}
                checked={selection.has(i.id)}
                onChange={(e) => {setScope("selected");
                  setChecked(e.target.checked ? [...selected, i.id] : selected.filter((id) => id !== i.id));
                }}
              />
              </label>}
            </div>
            <div className="catalog-product-copy">
              <h3><Link href={href}><bdi>{i.title}</bdi></Link></h3>
              {categories && <small className="catalog-product-categories" title={categories}>{categories}</small>}
              <small className="catalog-stock" data-available={i.available > 0}>
                {i.available} מתוך {i.variants} וריאציות זמינות · {i.images} תמונות
              </small>
              {i.linked && <small className="catalog-publication-status" data-published={!!i.siteUrl}>
                {i.siteUrl ? <Link href={i.siteUrl} prefetch={false} target="_blank" rel="noreferrer" aria-label={"פורסם באתר · " + i.title}>פורסם באתר ↗</Link>
                  : i.shopifyStatus === "DRAFT" ? "טיוטה ב־Shopify"
                  : i.shopifyStatus === "ARCHIVED" ? "בארכיון ב־Shopify"
                  : i.shopifyStatus ? "יובא ל־Shopify · מוסתר מהאתר"
                  : "קישור ל־Shopify נשמר · המוצר לא נמצא"}
              </small>}
              {status && <small className="catalog-product-status">{status}</small>}
            </div>
            <div className="catalog-product-prices">
              <small>מחיר מקור <bdi>{priceRange(i.sourceMin, i.sourceMax, i.currency)}</bdi></small>
              <strong>בחנות <bdi>{priceRange(i.finalMin, i.finalMax, "ILS")}</bdi></strong>
              {!i.linked && (
                <details className="catalog-price-edit"><summary><IconPencil/>עריכת מחיר</summary>
                <form
                  className="supplier-price"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    f.set("id", i.id);
                    f.set("revision", i.revision);
                    void action.run("price", f);
                  }}
                >
                  <input
                    type="number"
                    name="value"
                    min="0"
                    step="0.01"
                    aria-label={"מחיר ידני בשקלים עבור " + i.title}
                    placeholder="מחיר ידני ₪"
                    defaultValue={i.manual ?? ""}
                  />
                  <button className="btn btn-line" disabled={action.busy}>
                    שמור
                  </button>
                </form>
                </details>
              )}
            </div>
            <CatalogProductActions domain={site.domain} item={i} href={href} />
          </article>;
        })}</div>
        <div ref={feed.sentinel} className="catalog-feed-footer">
          <span role="status">{feed.error || (feed.loading ? "טוען מוצרים…" :
            items.length && !feed.more ? "הגעת לסוף הרשימה" : "")}</span>
          {feed.loading && <span className="catalog-feed-spinner" aria-hidden="true"/>}
          {(feed.more || feed.error) && !feed.loading && <button className="btn btn-line" onClick={feed.loadMore}>
            {feed.error ? "נסה שוב" : "טען עוד מוצרים"}
          </button>}
        </div>
      </div>
    </section>
  );
}

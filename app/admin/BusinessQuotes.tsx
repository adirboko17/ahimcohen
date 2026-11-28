import Link from "next/link";
import { IconCase, IconFwd, IconSearch } from "@/components/icons";
import { listBusinessQuotes } from "@/lib/admin/business-quotes";
import styles from "./BusinessQuotes.module.css";

const date = new Intl.DateTimeFormat("he-IL", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jerusalem" });

export async function BusinessQuotes({ requestedPage, search }: { requestedPage?: string; search?: string }) {
  const page = requestedPage && /^[1-9]\d{0,5}$/.test(requestedPage) ? Number(requestedPage) : 1;
  const query = typeof search === "string" ? search.trim().slice(0, 254) : "";
  const pageUrl = (number: number) => "/admin?" + new URLSearchParams({ tab: "quotes", page: String(number), ...(query && { q: query }) });
  const searchForm = <form action="/admin" method="get" role="search" aria-label="חיפוש בקשות להצעת מחיר" className={styles.search}>
    <input type="hidden" name="tab" value="quotes" />
    <label className={styles.searchField}>
      <IconSearch size={18} />
      <input key={query} type="search" name="q" defaultValue={query} maxLength={254} dir="auto"
        aria-label="חיפוש לפי שם עסק, איש קשר, טלפון או אימייל" placeholder="שם עסק, איש קשר, טלפון או אימייל" />
    </label>
    <button type="submit">חיפוש</button>
    {query && <Link href="/admin?tab=quotes">ניקוי חיפוש</Link>}
  </form>;
  let result;
  try { result = await listBusinessQuotes(page, query); }
  catch (error) {
    console.error("Could not list business quotes", error);
    return <div className={styles.list}>{searchForm}<p className="admin-panel supplier-box" role="alert">טעינת הבקשות נכשלה. <a href={pageUrl(page)}>טעינה מחדש</a></p></div>;
  }
  return <div className={styles.list}>
    {searchForm}
    {!result.quotes.length && <p className={`admin-panel ${styles.empty}`}>{page > 1 ? "אין בקשות נוספות בעמוד הזה." : query ? <>לא נמצאו בקשות עבור ״<bdi>{query}</bdi>״.</> : "טרם התקבלו בקשות להצעת מחיר."}</p>}
    {result.quotes.map(({ id, createdAt, items, branding, contact, logoName }) => {
      const units = items.reduce((total, item) => total + Object.values(item.sizes).reduce((sum, qty) => sum + qty, 0), 0);
      return <details className={styles.card} key={id} open={result.quotes.length === 1}>
        <summary className={styles.summary}>
          <span className={styles.businessIcon}><IconCase /></span>
          <span className={styles.identity}>
            <strong><bdi>{contact.org}</bdi></strong>
            <span className={styles.byline}>
              <span>איש קשר · <bdi>{contact.name}</bdi></span>
              <time dateTime={createdAt}>{date.format(new Date(createdAt))}</time>
            </span>
          </span>
          <span className={styles.total}><b>{units.toLocaleString("he-IL")}</b> יחידות</span>
          <span className={styles.toggle}><IconFwd /></span>
        </summary>
        <div className={styles.body}>
          <div className={styles.order}>
            <section>
              <h2>פריטים וכמויות</h2>
              <ul className={styles.products}>{items.map((item, index) => <li key={index}>
                <strong>{item.name}</strong>
                <div className={styles.meta}><span>מק״ט <bdi>{item.sku}</bdi></span>
                  {item.color && <span>צבע {item.color}</span>}
                </div>
                <dl className={styles.sizes} aria-label="כמות לפי מידה">{Object.entries(item.sizes).map(([size, qty]) =>
                  <div key={size}><dt><bdi>{size}</bdi></dt><dd>{qty.toLocaleString("he-IL")} יח׳</dd></div>
                )}</dl>
              </li>)}</ul>
            </section>
            {contact.notes && <section className={styles.note}><h2>הערות הלקוח</h2><p>{contact.notes}</p></section>}
          </div>
          <div className={styles.sidebar}>
            <section><h2>פרטי קשר</h2>
              <dl className={styles.contact}>
                <div><dt>איש קשר</dt><dd>{contact.name}</dd></div>
                <div><dt>טלפון</dt><dd><a href={`tel:${contact.phone}`}><bdi dir="ltr">{contact.phone}</bdi></a></dd></div>
                {contact.email && <div><dt>אימייל</dt><dd><a href={`mailto:${contact.email}`}><bdi dir="ltr">{contact.email}</bdi></a></dd></div>}
              </dl>
            </section>
            <section><h2>מיתוג ולוגו</h2>
              <ul className={styles.placements}>{branding.map(label => <li key={label}>{label}</li>)}</ul>
              {logoName ? <a href={`/admin/quote-logo/${id}`} download className={styles.file}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4" /></svg>
                <span><strong>הורדת הלוגו</strong><bdi>{logoName}</bdi></span>
              </a> : <p className={styles.noFile}>לא צורף קובץ לוגו</p>}
            </section>
          </div>
        </div>
      </details>;
    })}
    {(page > 1 || result.hasNext) && <nav aria-label="עמודי בקשות" className="admin-color-pagination">
      {page > 1 && <Link href={pageUrl(page - 1)} className="btn btn-line">העמוד הקודם</Link>}
      {result.hasNext && <Link href={pageUrl(page + 1)} className="btn btn-line">העמוד הבא</Link>}
    </nav>}
  </div>;
}

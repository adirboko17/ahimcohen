import Link from "next/link";
import { listBusinessQuotes } from "@/lib/admin/business-quotes";
import styles from "./BusinessQuotes.module.css";

const date = new Intl.DateTimeFormat("he-IL", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jerusalem" });
const pageUrl = (page: number) => "/admin?tab=quotes&page=" + page;

export async function BusinessQuotes({ requestedPage }: { requestedPage?: string }) {
  const page = requestedPage && /^[1-9]\d{0,5}$/.test(requestedPage) ? Number(requestedPage) : 1;
  let result;
  try { result = await listBusinessQuotes(page); }
  catch (error) {
    console.error("Could not list business quotes", error);
    return <p className="admin-panel supplier-box" role="alert">טעינת הבקשות נכשלה. <a href={pageUrl(page)}>טעינה מחדש</a></p>;
  }
  return <div className={styles.list}>
    {!result.quotes.length && <p className="admin-panel supplier-box">{page === 1 ? "טרם התקבלו בקשות להצעת מחיר." : "אין בקשות נוספות בעמוד הזה."}</p>}
    {result.quotes.map(({ id, createdAt, items, branding, contact, logoName }) => {
      const units = items.reduce((total, item) => total + Object.values(item.sizes).reduce((sum, qty) => sum + qty, 0), 0);
      return <details className={`admin-panel ${styles.card}`} key={id}>
        <summary><strong>{contact.org}</strong> · {units} יחידות <time dateTime={createdAt}>{date.format(new Date(createdAt))}</time></summary>
        <div className={styles.details}>
          <dl>
            <div><dt>איש קשר</dt><dd>{contact.name}</dd></div>
            <div><dt>טלפון</dt><dd><a href={`tel:${contact.phone}`} dir="ltr">{contact.phone}</a></dd></div>
            {contact.email && <div><dt>אימייל</dt><dd><a href={`mailto:${contact.email}`} dir="ltr">{contact.email}</a></dd></div>}
            <div><dt>מיתוג</dt><dd>{branding.join(" + ")}</dd></div>
            <div><dt>לוגו</dt><dd>{logoName ? <a href={`/admin/quote-logo/${id}`} download>הורדת <bdi>{logoName}</bdi></a> : "לא צורף"}</dd></div>
          </dl>
          {contact.notes && <div><h2>הערות</h2><p className={styles.notes}>{contact.notes}</p></div>}
          <div><h2>פריטים וכמויות</h2>
            <ul>{items.map((item, index) => <li key={index}>
              <strong>{item.name}</strong>
              <span>מק״ט <bdi>{item.sku}</bdi>{item.color && " · " + item.color}</span>
              <span>{Object.entries(item.sizes).map(([size, qty]) => <bdi className={styles.size} key={size}>{size} × {qty}</bdi>)}</span>
            </li>)}</ul>
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

import Link from "next/link";
import { ColorMappingEditor } from "@/components/ColorMappingEditor";
import { ProductImage } from "@/components/ProductImage";
import { suggestColorFromPhoto } from "@/lib/admin/color-photo";
import { catalogColorReview, suggestColorFromName } from "@/lib/admin/color-review";
import type { ColorMappings } from "@/lib/color-families";
import { loadShopCatalog } from "@/lib/shopify/load-catalog";

const pageSize = 10;

function reviewHref(approved: boolean, page = 1) {
  const params = new URLSearchParams({ tab: "colors", ...(approved && { status: "approved" }), ...(page > 1 && { page: String(page) }) });
  return `/admin?${params}`;
}

export async function ColorReview({ mappings, status, requestedPage }: { mappings?: ColorMappings; status?: string; requestedPage?: string }) {
  const catalog = await loadShopCatalog(true).catch(() => null);
  if (!catalog) return <p className="admin-panel admin-color-empty" role="alert">רשימת הצבעים לא נטענה. רעננו את העמוד כדי לנסות שוב.</p>;
  const audit = catalogColorReview(catalog.products, mappings);
  const approved = status === "approved";
  const rows = audit.filter(row => Boolean(row.approved) === approved);
  const approvedCount = audit.filter(row => row.approved).length;
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const requested = Number(requestedPage);
  const page = Number.isSafeInteger(requested) ? Math.max(1, Math.min(pages, requested)) : 1;
  const visible = rows.slice((page - 1) * pageSize, page * pageSize);
  const suggestions = await Promise.all(visible.map(async row => {
    if (row.approved) return null;
    return suggestColorFromName(row.label) ??
      (row.example.variant && row.example.image ? suggestColorFromPhoto(row.example.image) : null);
  }));

  return <div className="admin-color-review">
    <nav className="admin-color-tabs" aria-label="סטטוס מיפוי צבעים">
      <Link href={reviewHref(false)} prefetch={false} className={`btn btn-line ${!approved ? "admin-color-tab-current" : ""}`}
        aria-current={!approved ? "page" : undefined}>ממתינים לאישור ({audit.length - approvedCount})</Link>
      <Link href={reviewHref(true)} prefetch={false} className={`btn btn-line ${approved ? "admin-color-tab-current" : ""}`}
        aria-current={approved ? "page" : undefined}>צבעים מאושרים ({approvedCount})</Link>
    </nav>
    {visible.length === 0 && <p className="admin-panel admin-color-empty">{approved ? "אין צבעים שאושרו עדיין." : "כל הצבעים בקטלוג ממופים."}</p>}
    <div className="admin-color-list">
      {visible.map((row, index) => <article className="admin-panel admin-color-row" key={row.key}>
        <div className="admin-color-example">
          {row.example.image && <ProductImage src={row.example.image} alt={row.example.name} maxWidth={320} sizes="112px" />}
          <div>
            <h2><bdi>{row.label}</bdi></h2>
            <p>{row.count === 1 ? "מוצר אחד" : `${row.count} מוצרים`}</p>
            <Link href={`/p/${encodeURIComponent(row.example.id)}`} prefetch={false}>{row.example.name}</Link>
            <small>{row.example.variant ? "תמונת וריאנט" : row.example.image ? "תמונת מוצר" : "אין תמונה זמינה"}</small>
          </div>
        </div>
        <ColorMappingEditor item={row} suggestion={suggestions[index]} returnTo={reviewHref(approved, page)} />
      </article>)}
    </div>
    {pages > 1 && <nav className="admin-color-pagination" aria-label="עמודי צבעים">
      {page > 1 && <Link href={reviewHref(approved, page - 1)} prefetch={false} className="btn btn-line">הקודם</Link>}
      <span>עמוד {page} מתוך {pages}</span>
      {page < pages && <Link href={reviewHref(approved, page + 1)} prefetch={false} className="btn btn-line">הבא</Link>}
    </nav>}
  </div>;
}

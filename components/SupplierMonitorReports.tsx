"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { IgnoreSuggestion } from "./SupplierCatalog";
import { supplierUrl, type MonitorReport } from "@/lib/suppliers/catalog-model";

type ReportView = { kind: MonitorReport["kind"]; page: number };
type ReportResult = { view: ReportView; report?: MonitorReport; error?: string };
const reportDate = new Intl.DateTimeFormat("he-IL", {
  timeZone: "Asia/Jerusalem", dateStyle: "short", timeStyle: "short",
});
const availability = (available: boolean | null) => available === null ? "לא ידוע" : available ? "זמין" : "אזל";

async function reportRequest(domain: string, action: string, fields: Record<string, string>, signal?: AbortSignal) {
  const body = new FormData();
  for (const [name, value] of Object.entries({ domain, action, ...fields })) body.set(name, value);
  const response = await fetch("/admin/suppliers", { method: "POST", body, signal });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "הפעולה נכשלה.");
  return data;
}

export function SupplierMonitorReports({ domain, newCount, stockCount }: {
  domain: string; newCount: number; stockCount: number | null;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const [view, setView] = useState<ReportView | null>(null);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [reload, setReload] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const current = result?.view === view ? result : null;
  const report = current?.report;

  useEffect(() => {
    if (!view) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function load(openView: ReportView) {
      try {
        const data: MonitorReport = await reportRequest(domain, "monitor-report", {
          kind: openView.kind, page: String(openView.page),
        }, controller.signal);
        if (controller.signal.aborted) return;
        if (!data.items.length && openView.page > 1) {
          setView({ ...openView, page: openView.page - 1 });
          return;
        }
        setResult({ view: openView, report: data });
        if (data.kind === "new" && data.total !== newCount) router.refresh();
      } catch (error) {
        if (!controller.signal.aborted) setResult({
          view: openView, error: error instanceof Error ? error.message : "טעינת הדוח נכשלה.",
        });
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(() => void load(openView), 6000);
      }
    }
    void load(view);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [domain, view, reload, newCount, stockCount, router]);

  function open(kind: ReportView["kind"]) {
    setView({ kind, page: 1 });
    setNotice(null);
    dialog.current?.showModal();
  }

  async function queueImport(id?: string) {
    setSubmitting(true);
    setNotice(null);
    try {
      const result = await reportRequest(domain, "monitor-import", id ? { item: id } : { scope: "all" });
      setNotice({ text: result.message, ok: true });
      setReload(previous => previous + 1);
      router.refresh();
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : "הייבוא נכשל.", ok: false });
    } finally {
      setSubmitting(false);
    }
  }

  return <>
    <div className="supplier-monitor-reports" aria-label="דוחות מעקב" role="group">
      <button type="button" className="btn btn-line" onClick={() => open("new")}>
        מוצרים חדשים <bdi>{newCount}</bdi>
      </button>
      {stockCount === null ? <small>דוח המלאי אינו זמין כרגע.</small> :
        <button type="button" className="btn btn-line" onClick={() => open("stock")}>
          מוצרים עם שינוי במלאי <bdi>{stockCount}</bdi>
        </button>}
    </div>
    <dialog className="supplier-dialog supplier-monitor-dialog" ref={dialog} aria-labelledby={headingId} onClose={() => setView(null)}>
      <header>
        <h2 id={headingId}>{view?.kind === "new" ? "מוצרים חדשים" : "שינויי מלאי אוטומטיים"}</h2>
        <button type="button" className="btn btn-line" onClick={() => dialog.current?.close()}>סגור</button>
      </header>
      <p><bdi>{domain}</bdi></p>
      {view?.kind === "new" && <div className="supplier-report-toolbar">
        <button type="button" className="btn admin-primary" disabled={submitting || report?.kind !== "new" || !report.total}
          onClick={() => void queueImport()}>ייבא את כולם כטיוטות</button>
        {notice && <p className="admin-feedback" data-ok={notice.ok} role="status">{notice.text}</p>}
      </div>}
      {view && !current && <p role="status">טוען את הדוח…</p>}
      {current?.error && <p role="alert">{current.error}{" "}
        <button type="button" className="btn btn-line" onClick={() => setReload(previous => previous + 1)}>נסה שוב</button>
      </p>}
      {report?.kind === "new" && (report.items.length ? <ul className="supplier-report-list">
        {report.items.map(item => {
          const queued = item.task === "queued" || item.task === "running";
          return <li key={item.id} className="supplier-report-product">
            <div className="supplier-thumb">{item.image && <img src={item.image} alt="" loading="lazy" referrerPolicy="no-referrer" />}</div>
            <div className="supplier-report-product-copy">
              <strong><bdi>{item.title}</bdi></strong>
              {item.category && <small>{item.category}</small>}
              {item.task === "failed" && <small>{item.error || "הייבוא נכשל."}</small>}
            </div>
            <div className="supplier-report-toolbar">
              <button type="button" className="btn btn-line" disabled={submitting || queued}
                onClick={() => void queueImport(item.id)} aria-label={(queued ? "בתור לייבוא · " : "ייבא כטיוטה · ") + item.title}>
                {queued ? "בתור לייבוא" : "ייבא כטיוטה"}
              </button>
              <Link className="btn btn-line" href={supplierUrl(domain, "product", { item: item.id })} prefetch={false}>פרטי המוצר</Link>
              {!queued && <IgnoreSuggestion domain={domain} id={item.id} />}
            </div>
          </li>;
        })}
      </ul> : <p>אין כרגע מוצרים חדשים שממתינים לייבוא.</p>)}
      {report?.kind === "stock" && (report.items.length ? <ul className="supplier-report-list">
        {report.items.map(item => <li key={item.id} className="supplier-stock-report">
          <div className="supplier-report-toolbar">
            <Link href={"/p/" + encodeURIComponent(item.handle)} target="_blank" prefetch={false} rel="noreferrer"><strong><bdi>{item.title}</bdi></strong></Link>
            <time dateTime={item.applied_at}>{reportDate.format(new Date(item.applied_at))}</time>
          </div>
          <div className="supplier-table">
            <table aria-label={"שינויי מלאי · " + item.title}>
              <thead><tr><th>וריאציה</th><th>לפני אצל הספק</th><th>אחרי אצל הספק</th><th>באתר אחרי העדכון</th></tr></thead>
              <tbody>{item.changes.map(change => <tr key={change.variantId}>
                <td>{Object.entries(change.options).map(([name, value]) => name + " " + value).join(" · ") || "מוצר ללא וריאציות"}</td>
                <td>{availability(change.before)}</td>
                <td>{availability(change.after)}</td>
                <td>{availability(change.siteAvailable)}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </li>)}
      </ul> : <p>אין שינויי מלאי שנרשמו במעקב.</p>)}
      {view && report && (view.page > 1 || report.more) && <nav className="supplier-report-toolbar" aria-label="עמודי הדוח">
        <button type="button" className="btn btn-line" disabled={view.page === 1}
          onClick={() => setView({ ...view, page: view.page - 1 })}>הקודם</button>
        <button type="button" className="btn btn-line" disabled={!report.more}
          onClick={() => setView({ ...view, page: view.page + 1 })}>הבא</button>
      </nav>}
    </dialog>
  </>;
}

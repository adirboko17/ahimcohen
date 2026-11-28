"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Category } from "@/lib/catalog";
import { fmt } from "@/lib/pricing";
import { IconGrid, IconPencil, IconPlus, IconTrash, IconUpload } from "@/components/icons";
import { ProductGalleryPicker } from "./ProductGalleryPicker";
import { ProductBrandPicker } from "./ProductBrandPicker";

type Row = { key: number; parentId: string; sub: string };
const firstRow: Row = { key: 0, parentId: "", sub: "" };

function PublicationResult({ handle, title }: { handle: string; title: string }) {
  const [ready, setReady] = useState(false);
  const [delayed, setDelayed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;
    async function check() {
      try {
        const response = await fetch(`/admin/products?handle=${encodeURIComponent(handle)}`, { cache: "no-store", signal: controller.signal });
        if (response.status === 401) { setDelayed(true); return; }
        if (response.ok && (await response.json()).ready) {
          setReady(true);
          return;
        }
      } catch { /* A catalog refresh can outlast an individual request. */ }
      if (controller.signal.aborted) return;
      if (++attempts < 15) timer = setTimeout(check, 5000);
      else setDelayed(true);
    }
    void check();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [handle]);
  return <section className="admin-panel admin-editor admin-fields">
    <p role="status"><strong>{title}</strong> פורסם באתר.{!ready && (delayed ? " עדכון הקטלוג מתעכב. אפשר לבדוק את עמוד המוצר בעוד רגע." : " מעדכן את רשימות הקטלוג…")}</p>
    <div className="admin-row-actions">
      {(ready || delayed) && <a className="btn admin-primary" href={`/p/${encodeURIComponent(handle)}`}>צפייה במוצר באתר</a>}
      <a className="btn btn-line" href="/admin?tab=new-product">הוספת מוצר נוסף</a>
    </div>
  </section>;
}

export function NewProductForm({ categories, brands }: { categories: Category[]; brands: string[] }) {
  const [rows, setRows] = useState<Row[]>([firstRow]);
  const [photos, setPhotos] = useState<File[]>([]);
  const [regular, setRegular] = useState("");
  const [sale, setSale] = useState("");
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [published, setPublished] = useState<{ handle: string; title: string } | null>(null);
  const requestId = useRef("");
  const sending = useRef(false);
  const nextRow = useRef(1);
  const busy = Boolean(progress);
  const discounted = Number(sale) > 0 && Number(sale) < Number(regular);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    if (!String(data.get("brand") || "").trim()) {
      const search = form.querySelector<HTMLInputElement>(".np-search input");
      search?.setCustomValidity("בחרו מותג מהרשימה או הוסיפו מותג חדש.");
      search?.reportValidity();
      setError("בחרו מותג למוצר.");
      return;
    }
    if (sale && !discounted) {
      setError("מחיר המבצע צריך להיות נמוך מהמחיר המקורי.");
      form.querySelector<HTMLInputElement>('[name="sale"]')?.focus();
      return;
    }
    requestId.current ||= crypto.randomUUID();
    data.set("requestId", requestId.current);
    sending.current = true;
    setError("");
    try {
      for (const [index, file] of photos.entries()) {
        setProgress(`מעלה תמונה ${index + 1} מתוך ${photos.length}…`);
        const upload = await fetch("/admin/products/image", { method: "POST", headers: { "x-product-request": requestId.current }, body: file });
        const result = await upload.json();
        if (!upload.ok || !result.receipt) throw new Error(result.message || `העלאת ${file.name} נכשלה.`);
        data.append("gallery", result.receipt);
      }
      setProgress("מפרסם את המוצר…");
      const response = await fetch("/admin/products", { method: "POST", body: data });
      const result = await response.json();
      if (!response.ok || !result.handle) throw new Error(result.message || "פרסום המוצר נכשל.");
      setPublished({ handle: result.handle, title: String(data.get("title")) });
    } catch (cause) {
      setError(cause instanceof Error && !(cause instanceof TypeError || cause instanceof SyntaxError) ? cause.message : "התקשורת עם החנות נקטעה. נסו שוב מאותו טופס.");
    } finally {
      sending.current = false;
      setProgress("");
    }
  }

  if (published) return <PublicationResult {...published} />;

  return <form className="admin-form np-form" onSubmit={submit}>
    <fieldset className="np-layout" disabled={busy} aria-label="עריכת מוצר">
      <div className="np-column">
        <section className="np-card" aria-labelledby="np-details-title">
          <header className="np-card-heading"><h2 id="np-details-title">פרטי המוצר</h2><IconPencil /></header>
          <label className="field">שם המוצר<input name="title" required maxLength={255} placeholder="השם שיופיע באתר" /></label>
          <label className="field"><span>תיאור המוצר <small>אופציונלי</small></span><textarea name="description" rows={4} maxLength={5000} placeholder="חומרים, מידות ופרטים שכדאי לדעת" /></label>
        </section>
        <ProductGalleryPicker photos={photos} onChange={setPhotos} disabled={busy} />
      </div>
      <div className="np-column">
        <ProductBrandPicker brands={brands} />
        <section className="np-card" aria-labelledby="np-categories-title">
          <header className="np-card-heading"><h2 id="np-categories-title">קטגוריות</h2><IconGrid /></header>
          {rows.map((row, index) => <div key={row.key} className="np-category-row">
            <div className="np-pair">
              <label className="field">קטגוריה ראשית<select name="parent" required value={row.parentId}
                onChange={event => setRows(rows.map(item => item.key === row.key ? { ...item, parentId: event.target.value, sub: "" } : item))}>
                <option value="">בחרו קטגוריה</option>
                {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
              </select></label>
              <label className="field">תת־קטגוריה<select name="sub" value={row.sub}
                onChange={event => setRows(rows.map(item => item.key === row.key ? { ...item, sub: event.target.value } : item))}>
                <option value="">ראשית בלבד</option>
                {categories.find(cat => cat.id === row.parentId)?.subs.map(sub => <option key={sub}>{sub}</option>)}
              </select></label>
            </div>
            {rows.length > 1 && <button type="button" className="np-text-action" aria-label={`הסרת שיוך ${index + 1}`}
              onClick={() => setRows(rows.filter(item => item.key !== row.key))}><IconTrash />הסרת שיוך</button>}
          </div>)}
          {rows.length < 50 && <button type="button" className="np-text-action" onClick={() => setRows([...rows, { ...firstRow, key: nextRow.current++ }])}><IconPlus size={14} />שיוך לקטגוריה נוספת</button>}
        </section>
      </div>
      <section className="np-card np-prices" aria-labelledby="np-prices-title">
        <header className="np-card-heading"><h2 id="np-prices-title">תמחור</h2></header>
        <div className="np-pair">
          <label className="field">מחיר מקורי<span className="np-amount"><input type="number" name="regular" placeholder="0.00" min="0.01" max="99999999.99" step="0.01" inputMode="decimal" required value={regular} onChange={event => setRegular(event.target.value)} /><span>₪</span></span></label>
          <label className="field"><span>מחיר מבצע <small>אופציונלי</small></span><span className="np-amount"><input type="number" name="sale" placeholder="0.00" min="0.01" max="99999999.99" step="0.01" inputMode="decimal" value={sale} onChange={event => setSale(event.target.value)} /><span>₪</span></span></label>
        </div>
      </section>
    </fieldset>
    {error && <p className="np-error" role="alert">{error}</p>}
    <footer className="np-footer">
      <div><span>המחיר באתר</span><strong>{Number(regular) > 0 ? fmt(Number(discounted ? sale : regular)) : "—"}</strong>{discounted && <del>{fmt(Number(regular))}</del>}</div>
      <button className="btn admin-primary" type="submit" disabled={busy}><IconUpload /><span aria-live="polite">{progress || "פרסום המוצר באתר"}</span></button>
    </footer>
  </form>;
}

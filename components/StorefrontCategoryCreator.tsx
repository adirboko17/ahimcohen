"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import type { StorefrontCategoryChoice } from "@/lib/category-placement";
import { IconCheck, IconGrid, IconPlus } from "./icons";

type Category = { id: string; name: string; subs: string[] };
type Product = { id: string; revision: string };
type Result = { category: StorefrontCategoryChoice; assigned: string[]; failed: string[]; current?: Record<string, string[]> };
const productCount = (count: number) => count === 1 ? "מוצר אחד" : `${count} מוצרים`;
const subcategoryCount = (count: number) => count === 1 ? "תת־קטגוריה אחת" : `${count} תתי־קטגוריות`;

export function StorefrontCategoryCreator({ categories, domain, products = [], onCreated, showTree = false, suggestedSubcategory }: {
  categories: Category[];
  domain?: string;
  products?: Product[];
  onCreated?: (result: Result) => void;
  showTree?: boolean;
  suggestedSubcategory?: { label: string; parentId?: string; collectionId?: string };
}) {
  const [added, setAdded] = useState<StorefrontCategoryChoice[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ message: string; issue: boolean }>();
  const [parent, setParent] = useState(suggestedSubcategory?.parentId ?? "");
  const [updated, setUpdated] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const titleField = useRef<HTMLInputElement>(null);
  const headingId = useId();
  const roots = new Map(categories.map(category => [category.id, { ...category, subs: [...category.subs] }]));
  for (const { parentId, parent, sub } of added) {
    const root = roots.get(parentId) ?? { id: parentId, name: parent, subs: [] };
    if (sub && !root.subs.includes(sub)) root.subs.push(sub);
    roots.set(parentId, root);
  }
  const options = [...roots.values()];

  function openEditor(parentId = "") {
    const editor = dialog.current;
    if (!editor) return;
    setParent(parentId);
    setNotice(undefined);
    editor.showModal();
    titleField.current?.focus();
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    data.set("action", "create-category");
    if (suggestedSubcategory?.collectionId && String(data.get("label")).trim() === suggestedSubcategory.label)
      data.set("collection", suggestedSubcategory.collectionId);
    if (domain) data.set("domain", domain);
    for (const product of products) data.append("item", product.id + ":" + product.revision);
    setBusy(true);
    setNotice(undefined);
    try {
      const response = await fetch("/admin/suppliers", { method: "POST", body: data });
      if (!response.ok) {
        const reply = await response.json() as { message: string };
        throw new Error(reply.message);
      }
      const result = await response.json() as Result;
      const { category, assigned, failed } = result;
      setAdded(previous => [...previous.filter(item => item.parentId !== category.parentId || item.sub !== category.sub), category]);
      onCreated?.(result);
      const path = category.sub ? category.parent + " / " + category.sub : category.parent;
      const outcome = assigned.length ? ` · נשמר שיוך עבור ${productCount(assigned.length)}` : "";
      const error = failed.length ? `. השיוך של ${productCount(failed.length)} טרם נשמר. בדקו אם נתוני המוצרים השתנו או שהייבוא התחיל.` : "";
      setNotice({ message: `${path} נשמרה${outcome}${error}`, issue: failed.length > 0 });
      if (!failed.length) {
        if (showTree) {
          setUpdated(category.parentId);
          dialog.current?.close();
        }
        form.reset();
        setParent(suggestedSubcategory?.parentId ?? "");
      }
    } catch (error) {
      setNotice({ message: error instanceof Error ? error.message : "שמירת הקטגוריה נכשלה. אפשר לנסות שוב.", issue: true });
    } finally {
      setBusy(false);
    }
  }

  const fields = <>
    <label>שם {parent ? "תת־הקטגוריה" : "הקטגוריה"}
      <input ref={titleField} name="label" defaultValue={suggestedSubcategory?.label}
        placeholder={parent ? "למשל ציוד לקמפינג" : "למשל ציוד טיולים"} autoComplete="off"
        required maxLength={100} disabled={busy} />
    </label>
    <label>מיקום בחנות
      <select name="parent" value={parent} onChange={event => setParent(event.currentTarget.value)} disabled={busy} required={!!suggestedSubcategory}>
        <option value="" disabled={!!suggestedSubcategory}>{suggestedSubcategory ? "בחרו קטגוריה ראשית" : "קטגוריה ראשית"}</option>
        {options.map(category => <option key={category.id} value={category.id}>תחת {category.name}</option>)}
      </select>
    </label>
  </>;
  const saveLabel = busy ? "שומר…" : products.length ? "יצירה ושיוך" : "שמירת קטגוריה";

  if (showTree) return <div className="storefront-category-admin">
    <div className="storefront-category-toolbar">
      <div>
        <h2>מבנה הקטלוג</h2>
        <p>{options.length === 1 ? "קטגוריה ראשית אחת" : `${options.length} קטגוריות ראשיות`}<span aria-hidden="true"> · </span>
          {subcategoryCount(options.reduce((total, category) => total + category.subs.length, 0))}</p>
      </div>
      <button className="btn admin-primary storefront-category-add" type="button" onClick={() => openEditor()}>
        <IconPlus size={18} /> קטגוריה חדשה
      </button>
    </div>
    {notice && !notice.issue && <p className="storefront-category-success" role="status"><IconCheck />{notice.message}</p>}
    <div className="storefront-category-tree">
      {options.map(category => <article key={category.id} className="storefront-category-card" data-updated={updated === category.id}>
        <header>
          <span className="storefront-category-card-icon"><IconGrid /></span>
          <div>
            <h3><bdi>{category.name}</bdi></h3>
            <small>{category.subs.length ? subcategoryCount(category.subs.length) : "טרם נוספו תתי־קטגוריות"}</small>
          </div>
        </header>
        {category.subs.length > 0 && <ul>{category.subs.map(sub => <li key={sub}><bdi>{sub}</bdi></li>)}</ul>}
        <button type="button" className="storefront-category-card-add" onClick={() => openEditor(category.id)}
          aria-label={`הוספת תת־קטגוריה תחת ${category.name}`}><IconPlus size={16} /> הוספת תת־קטגוריה</button>
      </article>)}
    </div>
    <dialog ref={dialog} dir="rtl" className="storefront-category-dialog" aria-labelledby={headingId}
      onCancel={event => { if (busy) event.preventDefault(); }}
      onClose={() => {
        setParent("");
        if (notice?.issue) setNotice(undefined);
        if (titleField.current) titleField.current.value = "";
      }}>
      <header>
        <span className="storefront-category-card-icon"><IconPlus /></span>
        <h2 id={headingId}>{parent ? "תת־קטגוריה חדשה" : "קטגוריה חדשה"}</h2>
      </header>
      <form onSubmit={create}>
        <div className="storefront-category-dialog-fields">
          {fields}
          {notice?.issue && <p className="admin-feedback" role="alert">{notice.message}</p>}
        </div>
        <footer>
          <button type="button" className="btn btn-line" disabled={busy} onClick={() => dialog.current?.close()}>ביטול</button>
          <button type="submit" className="btn admin-primary" disabled={busy}>{saveLabel}</button>
        </footer>
      </form>
    </dialog>
  </div>;

  return <>
    <details className="storefront-category-creator" open={suggestedSubcategory ? true : undefined}>
      <summary>{products.length ? `יצירת קטגוריה ושיוך ${productCount(products.length)}` :
        suggestedSubcategory ? "יצירת תת־הקטגוריה המוצעת" : "הוספת קטגוריה או תת־קטגוריה"}</summary>
      <form onSubmit={create}>
        {fields}
        {suggestedSubcategory && products.length > 0 && <label>אופן השיוך
          <select name="mode" defaultValue="replace" disabled={busy}>
            <option value="replace">החלפת השיוכים הידניים באתר</option>
            <option value="add">הוספה לשיוכים הקיימים</option>
          </select>
        </label>}
        <button type="submit" className="btn admin-primary" disabled={busy}>{saveLabel}</button>
      </form>
    </details>
    {notice && <p className="admin-feedback" data-ok={!notice.issue} role={notice.issue ? "alert" : "status"}>{notice.message}</p>}
  </>;
}

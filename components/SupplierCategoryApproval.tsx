"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

type Option = { id: string; title: string };

export function SupplierCategoryApproval({ domain, run, sources, label, parent, parents, collections, target, catalogUrl }: {
  domain: string;
  run: string;
  sources: Option[];
  label: string;
  parent?: string;
  parents: Option[];
  collections: Option[];
  target?: string;
  catalogUrl: string;
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ message: string; ok: boolean; mapped: boolean }>();

  async function approve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    form.set("action", "approve-category");
    form.set("domain", domain);
    form.set("run", run);
    setNotice(undefined);
    setBusy(true);
    try {
      const response = await fetch("/admin/suppliers", { method: "POST", body: form });
      const reply = await response.json() as { message: string; mapped?: boolean };
      setNotice({ message: reply.message, ok: response.ok, mapped: !!reply.mapped });
    } catch {
      setNotice({ message: "החיבור נקטע. אפשר לנסות שוב.", ok: false, mapped: false });
    } finally {
      setBusy(false);
    }
  }

  return <form className="supplier-category-approval" onSubmit={approve}>
    <h3>הוספה כתת־קטגוריה באתר</h3>
    {sources.length > 1 ? <label>קטגוריית ספק לשיוך<select name="category" required onChange={() => setNotice(undefined)}>
      {sources.map(source => <option key={source.id} value={source.id}>{source.title}</option>)}
    </select></label> : <input type="hidden" name="category" value={sources[0]?.id} />}
    <label>שם שיופיע בסינון<input name="label" defaultValue={label} required maxLength={100} /></label>
    <label>קטגוריה ראשית<select name="parent" defaultValue={parent ?? ""} required>
      <option value="" disabled>בחרו קטגוריה ראשית</option>
      {parents.map(option => <option key={option.id} value={option.id}>{option.title}</option>)}
    </select></label>
    <label>אוסף Shopify<select name="collection" defaultValue={target ?? ""}>
      <option value="">יצירת אוסף חדש</option>
      {collections.map(option => <option key={option.id} value={option.id}>{option.title}</option>)}
    </select></label>
    <small>האישור מחבר את האוסף לאתר וממפה אליו את קטגוריית הספק. הסינון יוצג כשיש באוסף מוצרים שפורסמו לאתר.</small>
    <div className="supplier-toolbar">
      <button className="btn admin-primary" disabled={busy || notice?.mapped}>
        {busy ? "שומר…" : "אשר תת־קטגוריה"}
      </button>
      {notice?.ok && <Link className="btn btn-line" href={catalogUrl}>לקטלוג הספק</Link>}
    </div>
    {notice && <p role={notice.ok ? "status" : "alert"}>{notice.message}</p>}
  </form>;
}

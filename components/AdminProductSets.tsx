"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { Product } from "@/lib/catalog";
import { useCatalog } from "@/lib/catalog-context";
import { fmt } from "@/lib/pricing";
import { setExtras, type ProductSet } from "@/lib/product-sets";
import { AdminForm, AdminProductField, AdminProductSummary } from "./AdminControls";
import { ProductImage } from "./ProductImage";
import { IconBag, IconPencil } from "./icons";

type EditorSetting = Omit<ProductSet, "offer"> & { price?: number };

export function AdminProductSets({ settings, initialId }: { settings: EditorSetting[]; initialId?: string }) {
  const { product } = useCatalog();
  const router = useRouter();
  return <>
    <section className="admin-panel admin-editor admin-form admin-set-editor" id="set-editor">
      <AdminProductField key={initialId} initialId={initialId} label="לאיזה מוצר לערוך את הסט?"
        onSelection={id => {
          if (id && id !== initialId) router.replace("/admin?tab=sets&product=" + encodeURIComponent(id), { scroll: false });
        }}>
        {base => {
          if (!base) return null;
          const setting = settings.find(item => item.id === base.id);
          return <SetEditor key={base.id + (setting?.revision ?? "")} base={base} setting={setting} />;
        }}
      </AdminProductField>
    </section>
    <section className="admin-records" aria-labelledby="saved-sets-heading">
      <h2 id="saved-sets-heading">סטים שערכת <span>{settings.length}</span></h2>
      {settings.length ? <ul className="catalog-product-grid admin-set-grid">
        {settings.slice().reverse().map(setting => {
          const base = product(setting.id);
          const previews = setting.mode === "custom" ? setting.extras.flatMap(id => {
            const item = product(id);
            return item?.imgs?.[0] ? [{ id, src: item.imgs[0], name: item.name }] : [];
          }).slice(0, 3) : [];
          return <li className="catalog-product" key={setting.id}>
            <div className="catalog-photo admin-set-photo">
              {base?.imgs?.[0] ? <ProductImage src={base.imgs[0]} sizes="(max-width: 520px) 90vw, 300px" maxWidth={640} alt="" />
                : <span aria-hidden="true"><IconBag size={40} /></span>}
              {previews.length > 0 && <div className="admin-set-previews">
                {previews.map(item => <ProductImage key={item.id} src={item.src} alt={item.name} title={item.name} sizes="44px" maxWidth={160} />)}
              </div>}
            </div>
            <div className="catalog-product-copy">
              <h3 dir="auto">{base?.name ?? setting.id}</h3>
              {base?.sku && <small className="muted">מק״ט <bdi>{base.sku}</bdi></small>}
            </div>
            <div className="admin-set-card-footer">
              {setting.mode === "custom" && setting.price !== undefined
                ? <div className="admin-set-price"><small>מחיר הסט</small> <strong>{fmt(setting.price)}</strong></div>
                : <span className="admin-status" data-active={setting.mode === "custom"}>{setting.mode === "hidden" ? "מוסתר" : "הרכב אישי"}</span>}
              {base ? <Link className="btn admin-primary" prefetch={false}
                aria-label={`עריכת הסט של ${base.name}`} href={`/admin?tab=sets&product=${encodeURIComponent(base.id)}#set-editor`}><IconPencil />עריכה</Link>
                : <small>המוצר אינו בקטלוג</small>}
            </div>
          </li>;
        })}
      </ul> : <p className="admin-panel admin-empty">עדיין אין סטים בעריכה אישית.</p>}
    </section>
  </>;
}

function SetEditor({ base, setting }: { base: Product; setting?: EditorSetting }) {
  const { products, product } = useCatalog();
  const automatic = setExtras(base, products);
  const initial = setting?.mode === "custom" ? setting.extras : automatic.map(item => item.id);
  const [rows, setRows] = useState(() => initial.map((id, key) => ({ key, id })));
  const nextKey = useRef(initial.length);
  const [mode, setMode] = useState(setting?.mode ?? "auto");
  const [price, setPrice] = useState(setting?.price?.toString() ?? "");
  const regular = base.price + rows.reduce((sum, row) => sum + (product(row.id)?.price ?? 0), 0);
  return <AdminForm section="sets">
    <input type="hidden" name="productId" value={base.id} />
    <input type="hidden" name="revision" value={setting?.revision ?? ""} />
    <label className="field">תצוגה בעמוד המוצר
      <select name="mode" value={mode} onChange={e => setMode(e.target.value as typeof mode)}>
        <option value="auto">סט אוטומטי</option><option value="custom">סט בבחירה אישית</option><option value="hidden">הסתרת הסט למוצר הזה</option>
      </select>
    </label>
    {mode === "auto" && <div className="set-preview">
      <h3>הפריטים המשלימים שנבחרו אוטומטית</h3>
      {automatic.length ? automatic.map(item => <div className="admin-selected-product" key={item.id}><AdminProductSummary item={item} /></div>) : <p>כרגע אין המלצות אוטומטיות למוצר הזה.</p>}
      <button type="button" className="btn btn-line" onClick={() => setMode("custom")}>עריכת הרכב הסט והמחיר</button>
    </div>}
    {mode === "custom" && <>
      {rows.map((row, i) => <div className="set-extra" key={row.key}>
        <AdminProductField initialId={row.id} name="extra" label={`פריט משלים ${i + 1}`} onSelection={id => setRows(prev => prev.map(r => r.key === row.key ? { ...r, id } : r))} />
        <button type="button" className="btn btn-line" onClick={() => setRows(prev => prev.filter(r => r.key !== row.key))}>הסרת הפריט</button>
      </div>)}
      <button type="button" className="btn btn-line" onClick={() => setRows([...rows, { key: nextKey.current++, id: "" }])}>הוספת פריט משלים</button>
      <label className="field">מחיר לכל הסט (₪)
        <input name="price" type="number" min="0.01" step="0.01" value={price} onChange={e => setPrice(e.target.value)} placeholder="לפי מחירי הפריטים" />
        <small>סכום מחירי המוצרים החל מ־{fmt(regular)}. השאירו ריק כדי למכור כל פריט במחירו.</small>
      </label>
    </>}
    <Link href={"/p/" + encodeURIComponent(base.id)} target="_blank">צפייה בעמוד המוצר ↗</Link>
  </AdminForm>;
}

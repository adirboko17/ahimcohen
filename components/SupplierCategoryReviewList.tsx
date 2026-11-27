"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { catalogPageSize, supplierUrl } from "@/lib/suppliers/catalog-model";
import type { CategoryAssignmentResult } from "@/lib/suppliers/category-assignment";
import type { SupplierCategoryChoice, SupplierCategoryReviewProduct } from "@/lib/suppliers/category-review";
import type { Category } from "@/lib/catalog";
import { ProductListProgress } from "./ProductListProgress";
import { StorefrontCategoryCreator } from "./StorefrontCategoryCreator";

type Summary = { id: string; status: string; title: string; parent?: string; reason: string; productCount: number };
type Props = { domain: string; initialShown: number } & (
  { groups: Summary[]; products?: never; shop?: never; choices?: never; categories?: never; suggestedSubcategory?: never } |
  { groups?: never; products: SupplierCategoryReviewProduct[]; shop: string; choices: SupplierCategoryChoice[]; categories: Category[];
    suggestedSubcategory?: { label: string; parentId?: string; collectionId?: string } }
);

const choiceLabel = ({ parent, sub }: SupplierCategoryChoice) => sub ? parent + " / " + sub : parent;
const choiceKey = ({ parentId, sub }: SupplierCategoryChoice) => JSON.stringify([parentId, sub]);

function CategoryAssignmentForm({ domain, products, choices, suggested, onSave }: {
  domain: string;
  products: SupplierCategoryReviewProduct[];
  choices: SupplierCategoryChoice[];
  suggested?: SupplierCategoryChoice;
  onSave: (result: CategoryAssignmentResult) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ message: string; error: boolean }>();

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const choice = choices.find(candidate => choiceKey(candidate) === form.get("choice"));
    if (!choice) return;
    form.set("collection", choice.id);
    form.set("action", "assign-categories");
    form.set("domain", domain);
    for (const product of products) form.append("item", product.id + ":" + product.revision);
    setBusy(true);
    setNotice(undefined);
    try {
      const response = await fetch("/admin/suppliers", { method: "POST", body: form });
      if (!response.ok) {
        const { message } = await response.json() as { message: string };
        setNotice({ message, error: true });
        return;
      }
      const result = await response.json() as CategoryAssignmentResult;
      onSave(result);
      if (result.failed.length) {
        const message = result.failed.length === 1 ? result.failed[0].message :
          `השיוך של ${result.failed.length} מוצרים לא הושלם. ${result.failed[0].message}`;
        setNotice({ message, error: true });
      } else {
        setNotice({ message: result.assigned.length === 1 ? "השיוך נשמר למוצר." : `השיוך נשמר ל־${result.assigned.length} מוצרים.`, error: false });
      }
    } catch {
      setNotice({ message: "שמירת הקטגוריה נכשלה. אפשר לנסות שוב.", error: true });
    } finally {
      setBusy(false);
    }
  }

  const initial = suggested && choices.some(choice => choiceKey(choice) === choiceKey(suggested)) ? choiceKey(suggested) : "";
  return <form className="supplier-category-assignment" onSubmit={save}>
    <label>קטגוריה באתר
      <select name="choice" defaultValue={initial} required disabled={busy}>
        <option value="" disabled>בחרו קטגוריה או תת־קטגוריה</option>
        {choices.map(choice => <option value={choiceKey(choice)} key={choiceKey(choice)}>{choiceLabel(choice)}</option>)}
      </select>
    </label>
    <label>אופן השיוך
      <select name="mode" defaultValue="add" disabled={busy}>
        <option value="add">הוספה לשיוכים הקיימים</option>
        <option value="replace">החלפת השיוכים הידניים באתר</option>
      </select>
    </label>
    <button type="submit" className="btn admin-primary" disabled={busy || !products.length || !choices.length}>
      {busy ? "שומר…" : "שמור שיוך"}
    </button>
    {notice && <p className="admin-feedback" data-ok={!notice.error} role={notice.error ? "alert" : "status"}>{notice.message}</p>}
  </form>;
}

function ProductCategoryPicker({ domain, product, choices, current, onSave }: {
  domain: string;
  product: SupplierCategoryReviewProduct;
  choices: SupplierCategoryChoice[];
  current: string[] | null;
  onSave: (result: CategoryAssignmentResult) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!choices.length) return null;
  return <div className="supplier-product-category-picker">
    <button type="button" className="btn btn-line" aria-expanded={open} aria-controls={`product-category-${product.id}`}
      onClick={() => setOpen(!open)}>
      {open ? "סגור בחירה" : current?.length ? "שינוי שיוך" : "בחירת קטגוריה"}
    </button>
    <div id={`product-category-${product.id}`} hidden={!open}>
      {open && <CategoryAssignmentForm domain={domain} products={[product]} choices={choices} suggested={product.recommendation} onSave={result => {
        onSave(result);
        if (result.assigned.length) setOpen(false);
      }} />}
    </div>
  </div>;
}

export function SupplierCategoryReviewList({ domain, initialShown, groups, products, shop, choices, categories, suggestedSubcategory }: Props) {
  const [shown, setShown] = useState(initialShown);
  const [selected, setSelected] = useState<string[]>([]);
  const [saved, setSaved] = useState<Record<string, string[]>>({});
  const [bulkSaved, setBulkSaved] = useState(0);
  const [added, setAdded] = useState<SupplierCategoryChoice[]>([]);
  const total = groups?.length ?? products?.length ?? 0;
  const available = [...new Map([...(choices ?? []), ...added].map(choice => [choiceKey(choice), choice])).values()];
  const selectedIds = new Set(selected);
  const picked = products?.filter(product => selectedIds.has(product.id)) ?? [];
  const visibleIds = products?.slice(0, shown).map(product => product.id) ?? [];
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));

  function saveChoices(assigned: CategoryAssignmentResult["assigned"]) {
    const updated = new Map(assigned.map(product => [product.id, product.current]));
    setSaved(previous => ({ ...previous, ...Object.fromEntries(updated) }));
    setSelected(previous => previous.filter(id => !updated.has(id)));
  }

  return <>
    {categories && <div className="supplier-category-create-tools">
      <div className="supplier-category-selection">
        <div className="supplier-toolbar">
          <strong aria-live="polite">{picked.length ? `נבחרו ${picked.length} מוצרים` : "שיוך מוצרים"}</strong>
          <button type="button" className="btn btn-line" onClick={() => setSelected(previous => allVisibleSelected
            ? previous.filter(id => !visibleIds.includes(id)) : [...new Set([...previous, ...visibleIds])])}>
            {allVisibleSelected ? "בטל סימון של המוצגים" : "סמן את המוצגים"}
          </button>
          {suggestedSubcategory && products && products.length > visibleIds.length && picked.length < products.length &&
            <button type="button" className="btn btn-line" onClick={() => setSelected(products.map(product => product.id))}>
              סמן את כל {products.length} המוצרים בקבוצה
            </button>}
          {picked.length > 0 && <button type="button" className="btn btn-line" onClick={() => setSelected([])}>נקה בחירה</button>}
        </div>
        {picked.length > 0 && available.length > 0 ? <CategoryAssignmentForm domain={domain} products={picked} choices={available}
          onSave={({ assigned }) => { saveChoices(assigned); setBulkSaved(assigned.length); }} /> :
          bulkSaved && !picked.length ? <p className="admin-feedback" role="status" data-ok="true">
            {bulkSaved === 1 ? "השיוך נשמר למוצר." : `השיוך נשמר ל־${bulkSaved} מוצרים.`}
          </p> : <small>{available.length ? "סמנו מוצרים כדי לשייך אותם יחד." : "אפשר ליצור קטגוריה חדשה לשיוך המוצרים."}</small>}
      </div>
      <StorefrontCategoryCreator categories={categories} domain={domain} products={picked} suggestedSubcategory={suggestedSubcategory}
        onCreated={({ category, assigned, current }) => {
        setAdded(previous => [...previous.filter(item => choiceKey(item) !== choiceKey(category)), category]);
        if (assigned.length) saveChoices(assigned.map(id => ({ id, current: current?.[id] ?? [choiceLabel(category)] })));
      }} />
    </div>}
    {groups?.slice(0, shown).map(group => <article className="supplier-category-review-row" key={group.id}>
      <div>
        <small>{group.status}</small>
        <h3>{group.title}</h3>
        {group.parent && <small>תחת {group.parent}</small>}
        <p>{group.reason}</p>
      </div>
      <Link className="btn btn-line" href={supplierUrl(domain, "category-review", { cat: group.id })} prefetch={false}>
        {group.productCount} מוצרים לבדיקה
      </Link>
    </article>)}
    {products?.slice(0, shown).map(product => {
      const current = saved[product.id] ?? product.current;
      const recommendation = product.recommendation ? choiceLabel(product.recommendation) : product.proposedCategory;
      const currentLabel = current === null ? "השיוך הנוכחי טרם אומת" :
        current.length ? (saved[product.id] ? "השיוך נשמר" : "שיוך נוכחי") + " · " + current.join(" · ") : "אין שיוך לקטגוריית אתר";
      return <article className="supplier-category-review-row" key={product.id}>
        <div className="supplier-category-review-product">
          <div className="supplier-category-review-image">
            {product.image ? <img src={product.image} width={84} height={84} alt={product.title} loading="lazy" referrerPolicy="no-referrer" /> :
              <small>אין תמונה</small>}
          </div>
          <div>
            <strong>{product.title}</strong>
            <p className="supplier-category-recommendation">{recommendation
              ? <>המלצה · <bdi>{recommendation}</bdi></> : "נדרשת בחירה ידנית של קטגוריה"}</p>
            <small role={saved[product.id] ? "status" : undefined}>{currentLabel}</small>
          </div>
        </div>
        <div className="supplier-toolbar">
          <label className="supplier-check">
            <input type="checkbox" aria-label={`סימון ${product.title} לשיוך`}
              checked={selectedIds.has(product.id)} onChange={event => {
                const checked = event.currentTarget.checked;
                setSelected(previous => checked ? [...previous, product.id] : previous.filter(id => id !== product.id));
              }} /> סמן לשיוך
          </label>
          <Link className="btn btn-line" href={supplierUrl(domain, "product", { item: product.id })} prefetch={false}>תצוגת מוצר</Link>
          {product.shopifyId && <a className="btn btn-line" href={`https://${shop}/admin/products/${encodeURIComponent(product.shopifyId.split("/").pop()!)}`}>
            פתיחת המוצר ב־Shopify
          </a>}
        </div>
        <ProductCategoryPicker domain={domain} product={product} choices={available} current={current} onSave={({ assigned }) => saveChoices(assigned)} />
      </article>;
    })}
    {total > catalogPageSize && <ProductListProgress shown={shown} total={total} paused={false} setShown={setShown}
      className="supplier-category-review-progress" pageSize={catalogPageSize} />}
  </>;
}

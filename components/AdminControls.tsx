"use client";

import { useRouter } from "next/navigation";
import { Fragment, useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { bundleTierName, type AdminLabel, type AdminSaveResult } from "@/lib/admin/models";
import { colorLabel, type Product } from "@/lib/catalog";
import { useCatalog } from "@/lib/catalog-context";
import { useScrollLock } from "@/lib/store";
import { fmt } from "@/lib/pricing";
import { IconBag, IconCheck, IconFwd, IconLock, IconPencil, IconPlus, IconSearch, IconTrash } from "./icons";
import { ProductImage } from "./ProductImage";
import { AdminBackLink } from "./AdminBackLink";

const initial: AdminSaveResult = { message: "", ok: false };

export function AdminLogin({ error }: { error?: string }) {
  return (
    <main className="admin-login">
      <section className="admin-login-shell" aria-labelledby="admin-login-title">
        <div className="admin-login-brand">
          <img src="/logo.avif" alt="Cohen Brothers" width={168} />
          <Link href="/" className="admin-store-link">לאתר החנות <span aria-hidden="true"><IconFwd /></span></Link>
        </div>
        <form action="/admin/session" method="post" className="admin-login-card">
          <input type="hidden" name="operation" value="login" />
          <div className="admin-login-heading">
            <span className="admin-section-icon" aria-hidden="true"><IconLock size={22} /></span>
            <h1 className="k" id="admin-login-title">כניסה לניהול החנות</h1>
          </div>
          <label className="field">אימייל<input name="email" type="email" dir="ltr" autoComplete="username" maxLength={254} required /></label>
          <label className="field">סיסמה<input name="password" type="password" dir="ltr" autoComplete="current-password" maxLength={256} required /></label>
          {error && <p className="admin-feedback" role="alert">{error}</p>}
          <button type="submit" className="btn admin-primary">כניסה <span aria-hidden="true"><IconFwd /></span></button>
        </form>
      </section>
    </main>
  );
}

export async function sendAdminCommand(data: FormData): Promise<AdminSaveResult> {
  const response = await fetch("/admin/commands", { method: "POST", body: data });
  return await response.json() as AdminSaveResult;
}

export function AdminForm({ section, id, children, returnTo = `/admin?tab=${section}`, operation = "save", onSaved, onPendingChange, footerActions }: {
  section: string; id?: string; children: ReactNode; returnTo?: string; operation?: string;
  onSaved?: () => void; onPendingChange?: (pending: boolean) => void; footerActions?: ReactNode;
}) {
  const router = useRouter();
  const [result, setResult] = useState(initial);
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const disabled = pending || !ready;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
    if (!data.has("operation")) data.set("operation", operation);
    setPending(true);
    onPendingChange?.(true);
    setResult(initial);
    try {
      const outcome = await sendAdminCommand(data);
      setResult(outcome);
      if (outcome.ok) {
        if (!outcome.warning) {
          if (onSaved) onSaved();
          else router.replace(`${returnTo}&saved=1`);
        }
        router.refresh();
      }
    } catch {
      setResult({ ok: false, message: "השמירה נכשלה. נסו שוב." });
    } finally {
      setPending(false);
      onPendingChange?.(false);
    }
  };
  if (result.ok && result.warning && !id) {
    return <div className="admin-editor-result">
      <p className="admin-feedback" data-warning="true" role="status">{result.message}</p>
      <AdminBackLink href={returnTo} />
    </div>;
  }
  return (
    <form action="/admin/commands" method="post" encType="multipart/form-data" onSubmit={submit} className="admin-form">
      <input type="hidden" name="section" value={section} />
      {id && <input type="hidden" name="id" value={id} />}
      <div className="admin-fields" inert={onSaved && pending ? true : undefined}>{children}</div>
      <div className="admin-form-footer">
        {result.message && <p className="admin-feedback" data-ok={result.ok} data-warning={result.warning} role={result.ok ? "status" : "alert"}>{result.message}</p>}
        <div className="admin-form-buttons">
          <button type="submit" name="operation" value={operation} className="btn admin-primary" disabled={disabled}>
            <span aria-hidden="true"><IconCheck size={16} /></span>{pending ? "שומרים…" : onSaved ? "שמירת שינויים" : "שמירה"}
          </button>
          {footerActions}
        </div>
      </div>
    </form>
  );
}

export function AdminRemoveButton({ section, id, title }: { section: string; id: string; title: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const remove = async () => {
    if (pending || !window.confirm(`להסיר את ״${title}״?`)) return;
    const data = new FormData();
    data.set("section", section);
    data.set("id", id);
    data.set("operation", "delete");
    setPending(true);
    setError("");
    try {
      const outcome = await sendAdminCommand(data);
      if (outcome.ok) router.refresh();
      else setError(outcome.message);
    } catch {
      setError("ההסרה נכשלה. נסו שוב.");
    } finally {
      setPending(false);
    }
  };
  return <div className="admin-row-remove">
    <button type="button" className="admin-remove" onClick={remove} disabled={pending} aria-label={`הסרת ${title}`}>
      {(section === "bundles" || section === "offers" || section === "labels") && <IconTrash />}
      {pending ? "מסירים…" : section === "labels" ? "הסר תווית" : "הסרה"}
    </button>
    {error && <span className="admin-feedback" role="alert">{error}</span>}
  </div>;
}

export function AdminApproveReviewButton({ id, author }: { id: string; author: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function approve() {
    if (pending) return;
    const data = new FormData();
    data.set("section", "reviews");
    data.set("id", id);
    data.set("operation", "approve");
    setPending(true);
    setError("");
    try {
      const result = await sendAdminCommand(data);
      if (result.ok) router.refresh();
      else setError(result.message);
    } catch {
      setError("אישור הביקורת נכשל. נסו שוב.");
    } finally {
      setPending(false);
    }
  }

  return <div className="admin-review-approval">
    <button className="btn admin-primary admin-row-edit" type="button" onClick={approve} disabled={pending}
      aria-label={`אישור ביקורת מאת ${author}`}><IconCheck />{pending ? "מאשרים…" : "אישור"}</button>
    {error && <span className="admin-feedback" role="alert">{error}</span>}
  </div>;
}

export function AdminOfferVisibilityButton({ productId, hidden }: { productId: string; hidden: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<AdminSaveResult>(initial);
  return <div className="admin-row-remove">
    <button type="button" className="btn btn-line" disabled={pending} onClick={async () => {
      const data = new FormData();
      data.set("section", "offers");
      data.set("operation", hidden ? "show" : "hide");
      data.set("productId", productId);
      setPending(true);
      try {
        const result = await sendAdminCommand(data);
        setFeedback(result);
        if (result.ok) router.refresh();
      } catch {
        setFeedback({ ok: false, message: "עדכון התצוגה נכשל. נסו שוב." });
      } finally {
        setPending(false);
      }
    }}>{pending ? "מעדכנים…" : hidden ? "הצגה באתר" : "הסתרה באתר"}</button>
    {feedback.message && <span className="admin-feedback" role={feedback.ok ? "status" : "alert"} data-ok={feedback.ok}>{feedback.message}</span>}
  </div>;
}

function searchText(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[\p{M}'"׳״]/gu, "").replace(/[-–—־]+/g, " ").replace(/\s+/g, " ").trim();
}

export function AdminProductField({ initialId = "", initialVariant, variants = false, label = "מוצר", name = "productId", showSummary = true, children }: {
  initialId?: string; initialVariant?: string; variants?: boolean; label?: string;
  name?: string; showSummary?: boolean; children?: (product: Product | undefined) => ReactNode;
}) {
  const { products, product } = useCatalog();
  const [search, setSearch] = useState(() => product(initialId)?.name ?? "");
  const [selected, setSelected] = useState(initialId);
  const [variant, setVariant] = useState(initialVariant ?? "");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const current = product(selected);
  const catalog = useMemo(() => open ? products.map((item) => ({
    item, name: searchText(item.name), keywords: searchText(`${item.name} ${item.id} ${item.brand ?? ""}`),
    skus: [...new Set([item.sku, ...(item.choices ?? []).map((choice) => choice.sku)])].flatMap((sku) => sku ? [searchText(sku)] : []),
  })) : [], [open, products]);
  const query = searchText(search);
  const matches = useMemo(() => {
    if (!query) return catalog.slice(0, 8).map(({ item }) => item);
    const words = query.split(" ");
    return catalog.flatMap(({ item, name, keywords, skus }) => {
      if (skus.includes(query) || name === query) return [{ item, rank: 0 }];
      if (name.startsWith(query) || skus.some((sku) => sku.startsWith(query))) return [{ item, rank: 1 }];
      return words.every((word) => keywords.includes(word)) || skus.some((sku) => sku.includes(query)) ? [{ item, rank: 2 }] : [];
    }).sort((a, b) => a.rank - b.rank).slice(0, 8).map(({ item }) => item);
  }, [catalog, query]);
  useEffect(() => {
    input.current?.setCustomValidity(!current && search.trim() ? "בחרו מוצר מתוך תוצאות החיפוש." : "");
  }, [current, search]);
  useEffect(() => {
    if (highlight > 0) list.current?.children[highlight]?.scrollIntoView({ block: "nearest" });
  }, [highlight]);
  const choose = (item: Product) => {
    setSelected(item.id);
    setSearch(item.name);
    if (item.id !== selected) setVariant("");
    setOpen(false);
  };
  const available = current?.choices?.filter((item) => item.available) ?? [];
  return <>
    <div className="admin-product-field">
      <div className="admin-product-search">
        <label className="field">{label}<span className="admin-search-field">
          <span aria-hidden="true"><IconSearch size={16} /></span>
          <input ref={input} type="text" role="combobox" aria-autocomplete="list" aria-expanded={open && matches.length > 0}
            aria-controls={open && matches.length ? listId : undefined} aria-activedescendant={open && matches[highlight] ? `${listId}-${highlight}` : undefined}
            placeholder="הקלידו שם מוצר או מק״ט" autoComplete="off" required value={search}
            onFocus={(event) => { if (current) event.currentTarget.select(); setOpen(true); setHighlight(0); }}
            onBlur={() => setOpen(false)}
            onChange={(event) => { setSearch(event.target.value); setSelected(""); setVariant(""); setOpen(true); setHighlight(0); }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "Escape" && open) { event.preventDefault(); setOpen(false); }
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                setOpen(true);
                const delta = event.key === "ArrowDown" ? 1 : -1;
                setHighlight(open && matches.length ? Math.max(0, Math.min(matches.length - 1, highlight + delta)) : 0);
              }
              if (event.key === "Enter" && open && matches[highlight]) { event.preventDefault(); choose(matches[highlight]); }
            }} />
        </span></label>
        <input type="hidden" name={name} value={current?.id ?? ""} />
        {open && (matches.length ? <ul className="admin-product-suggestions" id={listId} role="listbox" aria-label="מוצרים תואמים" ref={list}>
          {matches.map((item, index) => <li key={item.id} id={`${listId}-${index}`} role="option" aria-selected={index === highlight}
            onPointerDown={(event) => event.preventDefault()} onClick={() => choose(item)}>
            <AdminProductSummary item={item} />
          </li>)}
        </ul> : <div className="admin-product-suggestions" role="status">לא נמצאו מוצרים תואמים</div>)}
      </div>
      {variants && <label className="field admin-variant-field">צבע ומידה<select name="variantId" value={variant} required onChange={(event) => setVariant(event.target.value)}>
        <option value="">{current && !available.length ? "אין וריאנטים זמינים" : "בחרו וריאנט"}</option>
        {available.map((item) => <option key={item.id} value={item.id}>{[item.color && colorLabel(item.color), item.size, item.sku].filter(Boolean).join(" · ")}</option>)}
      </select></label>}
      {showSummary && current && <div className="admin-selected-product">
        <AdminProductSummary item={current} />
      </div>}
    </div>
    {children?.(current)}
  </>;
}

export function AdminLabelEditor({ item }: { item?: AdminLabel }) {
  const [text, setText] = useState(item?.text ?? "");
  const previewTitle = useId();
  return <AdminForm section="labels" id={item?.id}>
    <div className="admin-label-editor">
      <AdminProductField initialId={item?.productId} showSummary={false}>
        {product => {
          const image = product?.imgs?.find(Boolean) ?? product?.choices?.find(choice => choice.image)?.image;
          return <>
            <label className="field">טקסט התווית
              <input name="label" maxLength={60} value={text} onChange={event => setText(event.target.value)}
                placeholder="מבצע חדש" required />
            </label>
            <section className="admin-label-live" aria-labelledby={previewTitle}>
              <h2 id={previewTitle}>תצוגה מקדימה</h2>
              {product ? <div className="admin-label-live-product">
                <div className="admin-label-live-photo">
                  {image ? <ProductImage src={image} alt={product.name} sizes="112px" maxWidth={320}/>
                    : <span>אין תמונת מוצר</span>}
                </div>
                <div className="admin-label-live-copy">
                  {text.trim() && <span className="badge y product-promo-label">{text.trim()}</span>}
                  <strong dir="auto">{product.name}</strong>
                  {product.sku && <small>מק״ט <bdi>{product.sku}</bdi></small>}
                </div>
              </div> : <p>בחרו מוצר כדי להציג אותו כאן.</p>}
            </section>
          </>;
        }}
      </AdminProductField>
    </div>
  </AdminForm>;
}

export function AdminProductSummary({ item }: { item: Pick<Product, "name" | "sku" | "imgs"> }) {
  return <>
    <span className="admin-product-thumb" aria-hidden="true">
      {item.imgs?.[0] ? <ProductImage src={item.imgs[0]} alt="" sizes="48px" maxWidth={160} /> : <IconBag size={21} />}
    </span>
    <span className="admin-product-summary-name"><strong dir="auto">{item.name}</strong>{item.sku && <small>מק״ט <bdi>{item.sku}</bdi></small>}</span>
  </>;
}

const productLists = {
  bundles: { heading: "מוצרים עם באנדלים", countLabel: "מוצרים", one: "מוצר אחד", empty: "עוד לא נשמרו באנדלים למוצרים", noMatches: "לא נמצאו מוצרים תואמים" },
  offers: { heading: "מבצעי כמות שמורים", countLabel: "מבצעים", one: "מבצע אחד", empty: "עוד לא נשמרו מבצעי כמות", noMatches: "לא נמצאו מבצעי כמות תואמים" },
  reviews: { heading: "מוצרים עם ביקורות", countLabel: "מוצרים", one: "מוצר אחד", empty: "עדיין אין מוצרים עם ביקורות", noMatches: "לא נמצאו מוצרים תואמים" },
} as const;

export function AdminProductList({ section, entries }: {
  section: keyof typeof productLists;
  entries: { id: string; keywords: string; card: ReactNode }[];
}) {
  const [search, setSearch] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const indexed = useMemo(() => entries.map((entry) => ({ ...entry, keywords: searchText(entry.keywords) })), [entries]);
  const query = searchText(search);
  const words = query.split(" ");
  const matches = query ? indexed.filter(({ keywords }) => words.every((word) => keywords.includes(word))) : indexed;
  const { heading, countLabel, one, empty, noMatches } = productLists[section];
  const cards = matches.map(({ id, card }) => <Fragment key={id}>{card}</Fragment>);

  return <section className="admin-records admin-product-list" aria-labelledby={titleId}>
    <header className="admin-panel admin-product-list-toolbar">
      <div>
        <h2 id={titleId}>{heading}</h2>
        <p className="admin-product-list-count" role="status">
          {query ? `${matches.length} מתוך ${entries.length} ${countLabel}` : entries.length === 1 ? one : `${entries.length} ${countLabel}`}
        </p>
      </div>
      <div className="admin-product-list-search" role="search" aria-labelledby={titleId}>
        <IconSearch size={19} />
        <input ref={input} type="search" aria-label="חיפוש לפי שם מוצר או מק״ט" placeholder="חיפוש לפי שם מוצר או מק״ט"
          autoComplete="off" value={search} onChange={(event) => setSearch(event.target.value)} />
        {search && <button type="button" className="admin-product-list-clear" aria-label="ניקוי חיפוש" onClick={() => {
          setSearch("");
          input.current?.focus();
        }}>×</button>}
      </div>
    </header>
    {!matches.length && <div className="admin-panel admin-empty admin-product-list-empty">
      {query ? <IconSearch size={23} /> : <IconBag size={23} />}
      <strong>{query ? noMatches : empty}</strong>
      {query && <p>נסו שם מוצר או מק״ט אחר.</p>}
    </div>}
    {section === "reviews" && cards.length > 0 ? <div className="admin-review-grid">{cards}</div> : cards}
  </section>;
}

type BundleTierValues = { id?: string; quantity: number; total?: number; title: string; bestValue?: boolean; showInQuantityOffers?: boolean; active?: boolean };
type BundleTierRow = { id: number; quantity: string; initial?: BundleTierValues };

function nextTierQuantity(reserved: number[], rows: BundleTierRow[] = []) {
  const used = new Set([...reserved, ...rows.map((row) => Number(row.quantity))]
    .filter((quantity) => Number.isInteger(quantity) && quantity >= 2 && quantity <= 250));
  const next = Math.max(1, ...used) + 1;
  if (next <= 250) return String(next);
  for (let quantity = 2; quantity <= 250; quantity++) {
    if (!used.has(quantity)) return String(quantity);
  }
  return "";
}

export function AdminBundleFields({ initialId, initial, reservedQuantities = [] }: {
  initialId?: string; initial?: BundleTierValues; reservedQuantities?: number[];
}) {
  return <AdminProductField initialId={initialId} label="מוצר הבסיס">{(product) => <BundleTiers product={product}
    initialTiers={initial ? [initial] : []} reservedQuantities={reservedQuantities} />}</AdminProductField>;
}

export function AdminBundleDialog({ id, summary, tiers, snapshot }: {
  id: string; summary: Pick<Product, "name" | "sku" | "imgs">; tiers: BundleTierValues[]; snapshot: string;
}) {
  const { product } = useCatalog();
  const [editor, setEditor] = useState<{ tiers: BundleTierValues[]; snapshot: string } | null>(null);
  const open = !!editor;
  const [pending, setPending] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  useScrollLock(open);
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
  }, [open]);
  const close = () => dialog.current?.close();

  return <>
    <button ref={trigger} type="button" className="btn btn-line admin-promotion-edit" aria-haspopup="dialog" aria-expanded={open}
      aria-label={`עריכת ${summary.name}`} onClick={() => setEditor({ tiers, snapshot })}><IconPencil />עריכה</button>
    {editor && <dialog ref={dialog} className="admin-bundle-dialog" aria-labelledby={titleId}
      onCancel={(event) => { if (pending) event.preventDefault(); }} onClose={() => { setEditor(null); trigger.current?.focus(); }}>
      <header className="admin-bundle-dialog-header">
        <h2 id={titleId}>עריכת באנדלים</h2>
        <button type="button" className="btn btn-line admin-bundle-dialog-close" aria-label="סגירת חלון העריכה" disabled={pending} onClick={close}>×</button>
      </header>
      <AdminForm section="bundles" operation="save-group" onSaved={close} onPendingChange={setPending}
        footerActions={<button type="button" className="btn btn-line" disabled={pending} onClick={close}>ביטול</button>}>
        <input type="hidden" name="productId" value={id} />
        <input type="hidden" name="snapshot" value={editor.snapshot} />
        <div className="admin-selected-product"><AdminProductSummary item={summary} /></div>
        <BundleTiers product={product(id)} initialTiers={editor.tiers} group />
      </AdminForm>
    </dialog>}
  </>;
}

function BundleTiers({ product, initialTiers, reservedQuantities = [], group = false }: {
  product?: Product; initialTiers: BundleTierValues[]; reservedQuantities?: number[]; group?: boolean;
}) {
  const [rows, setRows] = useState<BundleTierRow[]>(() => initialTiers.length
    ? initialTiers.map((initial, id) => ({ id, quantity: String(initial.quantity), initial })) : [{ id: 0, quantity: nextTierQuantity(reservedQuantities) }]);
  const [bestRow, setBestRow] = useState(() => initialTiers.findIndex((tier) => tier.bestValue));
  const nextId = useRef(Math.max(initialTiers.length, 1));
  const container = useRef<HTMLDivElement>(null);
  const focusNewTier = useRef(false);
  const bestIndex = rows.findIndex(({ id }) => id === bestRow);
  const variantPrices = product?.choices?.filter((choice) => choice.available).map((choice) => choice.price) ?? [];
  const unitPrice = variantPrices.length ? Math.min(...variantPrices) : product?.price;
  const varies = unitPrice !== undefined && variantPrices.some((price) => price !== unitPrice);
  useEffect(() => {
    if (focusNewTier.current) {
      container.current?.querySelectorAll<HTMLInputElement>('input[name="quantity"]').item(rows.length - 1)?.focus();
      focusNewTier.current = false;
    }
  }, [rows.length]);
  return <div className="admin-bundle-tiers" ref={container}>
      <div className="admin-bundle-unit-price">
        <span>מחיר יחידה רגיל</span>
        <output aria-label="מחיר יחידה רגיל">{varies && "החל מ־"}<bdi>{unitPrice === undefined ? "—" : fmt(unitPrice)}</bdi></output>
      </div>
      <h3>מדרגות הבאנדל</h3>
      <input type="hidden" name="bestValue" value={bestIndex < 0 ? "" : bestIndex} />
      {rows.length === 0 && <p className="admin-empty">אין מדרגות בבאנדל. שמירת השינויים תסיר את הבאנדל מהמוצר.</p>}
      {rows.map(({ id, quantity, initial }, index) => <AdminBundleTier key={id} index={index} initial={initial} quantity={quantity} group={group}
        unitPrice={unitPrice} varies={varies} bestValue={bestRow === id}
        onQuantityChange={(value) => setRows((current) => current.map((row) => row.id === id ? { ...row, quantity: value } : row))}
        onBestValueChange={(checked) => setBestRow(checked ? id : -1)}
        onRemove={group || rows.length > 1 && !initial ? () => {
          setRows((current) => current.filter((row) => row.id !== id));
          setBestRow((current) => current === id ? -1 : current);
        } : undefined} />)}
      <button type="button" className="btn btn-line admin-add-tier" disabled={rows.length >= 249} onClick={() => {
        const id = nextId.current++;
        focusNewTier.current = true;
        setRows((current) => [...current, { id, quantity: nextTierQuantity(reservedQuantities, current) }]);
      }}><IconPlus size={16} />הוספת מדרגה</button>
    </div>;
}

const formatPercent = new Intl.NumberFormat("he-IL", { style: "percent", maximumFractionDigits: 1 });

function AdminBundleTier({ index, initial, quantity, unitPrice, varies, bestValue, group, onQuantityChange, onBestValueChange, onRemove }: {
  index: number; initial?: BundleTierValues; quantity: string; unitPrice?: number; varies: boolean; bestValue: boolean;
  group: boolean;
  onQuantityChange: (value: string) => void; onBestValueChange: (checked: boolean) => void; onRemove?: () => void;
}) {
  const [price, setPrice] = useState(initial?.total === undefined ? "" : String(initial.total));
  const [active, setActive] = useState(initial?.active ?? true);
  const [showInQuantityOffers, setShowInQuantityOffers] = useState(!!initial?.showInQuantityOffers);
  const units = Number(quantity);
  const validQuantity = Number.isInteger(units) && units >= 2 && units <= 250;
  const regularTotal = validQuantity && unitPrice !== undefined ? Math.round(unitPrice * 100) * units / 100 : undefined;

  return <fieldset className="admin-bundle-tier" data-best-value={bestValue}>
    <legend>מדרגה {index + 1}</legend>
    {group && <><input type="hidden" name="tierId" value={initial?.id ?? ""} /><input type="hidden" name="tierActive" value={active ? "yes" : "no"} /></>}
    <div className="admin-bundle-tier-pricing">
      <label className="field">מספר יחידות<input name="quantity" type="number" min={2} max={250} value={quantity} onChange={(event) => onQuantityChange(event.target.value)} required /></label>
      <label className="field">מחיר כולל בש״ח<input name="total" type="number" min="0.01" max={100000} step="0.01" value={price}
        placeholder={regularTotal === undefined ? undefined : String(regularTotal)} onChange={(event) => setPrice(event.target.value)} required /></label>
    </div>
    <div className="admin-bundle-tier-options">
      <label className="field">שם לתצוגה<input name="title" placeholder={validQuantity ? bundleTierName(units) : undefined} defaultValue={initial?.title} maxLength={120} /></label>
      <div className="admin-bundle-tier-actions">
        <label className="admin-check admin-bundle-best-value"><input type="checkbox" checked={bestValue} onChange={(event) => onBestValueChange(event.target.checked)} />הכי משתלם</label>
        {onRemove && <button type="button" className="admin-remove admin-bundle-remove-tier" aria-label={`הסרת מדרגה ${index + 1}`} onClick={onRemove}><IconTrash /></button>}
      </div>
    </div>
    <BundlePriceReference unitPrice={unitPrice} quantity={units} price={price ? Number(price) : undefined} varies={varies} />
    <div className="admin-bundle-tier-visibility">
      {group && <label className="admin-check"><span>פעיל באתר</span><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /></label>}
      <input type="hidden" name="showInQuantityOffers" value={showInQuantityOffers ? "yes" : "no"} />
      <label className="admin-check">
        <span>הצגה גם בעמוד מבצעי כמות</span>
        <input type="checkbox" checked={showInQuantityOffers} onChange={(event) => setShowInQuantityOffers(event.target.checked)} />
      </label>
    </div>
  </fieldset>;
}

function BundlePriceReference({ unitPrice, quantity, price, varies }: { unitPrice?: number; quantity: number; price?: number; varies: boolean }) {
  if (unitPrice === undefined || !Number.isFinite(unitPrice) || !Number.isInteger(quantity) || quantity < 2 || quantity > 250) return null;
  const regularCents = Math.round(unitPrice * 100) * quantity;
  const savingsCents = price !== undefined && Number.isFinite(price) && price > 0 ? regularCents - Math.round(price * 100) : null;
  return <div className="admin-bundle-reference" aria-live="polite">
      <div className="admin-bundle-reference-price">
        <strong>מחיר רגיל לכמות{varies ? " החל מ־" : ""} <bdi>{fmt(regularCents / 100)}</bdi></strong>
        <small><bdi>{fmt(unitPrice)}</bdi> ליחידה × {quantity} יחידות</small>
      </div>
      {savingsCents !== null && savingsCents > 0 && <span className="admin-bundle-saving">
        חיסכון{varies ? " מהמחיר הנמוך" : ""} <bdi>{fmt(savingsCents / 100)}</bdi> (<bdi>{formatPercent.format(savingsCents / regularCents)}</bdi>)
      </span>}
      {savingsCents !== null && savingsCents < 0 && !varies && <span className="admin-bundle-price-difference"><bdi>{fmt(-savingsCents / 100)}</bdi> מעל המחיר הרגיל</span>}
  </div>;
}

export function CopyAdminLink({ href }: { href: string }) {
  const [feedback, setFeedback] = useState("");
  return <>
    <a className="admin-row-link" href={href} target="_blank" rel="noreferrer">פתיחה</a>
    <button type="button" className="admin-row-link" onClick={async () => {
      try {
        await navigator.clipboard.writeText(new URL(href, window.location.origin).href);
        setFeedback("הועתק");
      } catch { setFeedback("ההעתקה נכשלה"); }
    }} aria-live="polite">{feedback || "העתקת קישור"}</button>
  </>;
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { catalogPrice, supplierUrl } from "@/lib/suppliers/catalog-model";
import type { SupplierBrand } from "@/lib/suppliers/brand";
import type { Preview } from "@/lib/suppliers/storage";
import type { SupplierCollectionOption } from "@/lib/suppliers/storefront-collections";
import { IconCheck, IconFwd, IconSearch } from "./icons";

type Props = {
  id: string;
  row: Pick<Preview, "snapshot" | "scanned_at" | "revision">;
  brand: SupplierBrand;
  collections: SupplierCollectionOption[];
  selected: string[];
  proposedCategory?: { id: string; parent: string; sub: string };
  shopifyUrl?: string;
  siteUrl?: string;
  canPublish: boolean;
  domain: string;
  finalPrices: Record<string, number>;
  scanError: string | null;
};

const localTime = new Intl.DateTimeFormat("he-IL", {
  timeZone: "Asia/Jerusalem", dateStyle: "short", timeStyle: "short",
});
const formatNumber = new Intl.NumberFormat("he-IL", { maximumFractionDigits: 2 });
function priceRange(prices: number[], currency: string) {
  if (!prices.length) return "";
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  return (low === high ? formatNumber.format(low) : `${formatNumber.format(low)}–${formatNumber.format(high)}`) +
    (currency === "ILS" ? " ₪" : " " + currency);
}

export function SupplierPreview({ id, row, brand, collections, selected, proposedCategory, shopifyUrl, siteUrl,
  canPublish, domain, finalPrices, scanError }: Props) {
  const router = useRouter();
  const confirmPublish = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState("");
  const [refreshing, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ message: string; ok: boolean }>();
  const [image, setImage] = useState("");
  const [editedBrand, setEditedBrand] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editedCollections, setEditedCollections] = useState<{ initial: string; ids: string[] }>();
  const pending = !!busy || refreshing;
  const p = row.snapshot;
  const linked = !!shopifyUrl;
  const initial = JSON.stringify(selected);
  const ids = !linked && editedCollections?.initial === initial ? editedCollections.ids : selected;
  const picked = collections.filter(collection => ids.includes(collection.id));
  const paths = [...new Map(picked.flatMap(collection => collection.paths)
    .map(path => [JSON.stringify([path.parentId, path.sub]), path])).values()];
  const withoutPath = picked.filter(collection => !collection.paths.length);
  const showProposal = proposedCategory && !paths.some(path => path.parentId === proposedCategory.id && path.sub === proposedCategory.sub);
  const visibleCollections = collections.filter(collection => {
    const label = [collection.title, ...collection.paths.flatMap(path => [path.parent, path.sub])].join(" ");
    return label.toLowerCase().includes(search.trim().toLowerCase());
  });
  const currentBrand = (linked ? brand.name : editedBrand ?? brand.name);
  const brandWarning = !currentBrand.trim() ? "המותג לא זוהה. אפשר להזין את שם המותג לפני הפרסום." :
    !linked && brand.evidence === "category" && currentBrand.trim() === brand.name ? "הצעת מותג לפי קטגוריית הספק. כדאי לבדוק שהשם נכון לפני הפרסום." : "";
  const heroImage = p.images.includes(image) ? image : p.images[0];
  const sourcePrice = priceRange(p.variants.map(variant => catalogPrice(variant.price, variant.regular)), p.currency || "ILS");
  const storePrice = priceRange(Object.values(finalPrices), "ILS");
  const available = p.variants.filter(variant => variant.available).length;

  async function run(action: "scan" | "publish", form = new FormData()) {
    if (pending) return;
    setBusy(action);
    setFeedback(undefined);
    form.set("action", action);
    form.set("id", id);
    form.set("domain", domain);
    form.set("revision", row.revision);
    try {
      const response = await fetch("/admin/suppliers", { method: "POST", body: form });
      const data = await response.json();
      setFeedback({ ok: response.ok, message: data.message });
      startTransition(() => router.refresh());
    } catch {
      setFeedback({ ok: false, message: "החיבור נקטע. רעננו ובדקו את מצב המוצר באתר." });
      startTransition(() => router.refresh());
    } finally {
      setBusy("");
    }
  }

  function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canPublish || scanError || !linked && (!picked.length || !storePrice)) return;
    if (!linked) {
      confirmPublish.current?.showModal();
      return;
    }
    void run("publish");
  }

  function publishUnlinked() {
    confirmPublish.current?.close();
    const form = new FormData();
    form.set("brand", currentBrand);
    for (const collection of picked) form.append("collection", collection.id);
    void run("publish", form);
  }

  return <article className="admin-panel supplier-preview">
    <div className="supplier-product-overview">
      <div className="supplier-product-media">
        <div className="supplier-product-photo">
          {heroImage ? <img src={heroImage} alt={p.title} /> : <span>אין תמונת מוצר</span>}
        </div>
        {p.images.length > 1 && <div className="supplier-product-thumbs" aria-label="תמונות המוצר">
          {p.images.map((url, index) => <button key={url} type="button" aria-label={`תמונה ${index + 1}`}
            aria-pressed={heroImage === url} onClick={() => setImage(url)}>
            <img src={url} alt="" loading="lazy" />
          </button>)}
        </div>}
      </div>
      <div className="supplier-product-summary">
        <span className="supplier-product-state" data-live={!!siteUrl}>
          {siteUrl ? <><IconCheck size={15} /> פורסם באתר</> : linked ? "מוצר מקושר ב־Shopify" : "מוצר הספק"}
        </span>
        <h2><bdi>{p.title}</bdi></h2>
        {p.category && <p className="supplier-product-source-category"><strong>קטגוריות הספק</strong> {p.category}</p>}
        <dl className="supplier-product-metrics">
          <div><dt>מחיר בחנות</dt><dd><bdi>{storePrice || "נדרש מחיר"}</bdi></dd></div>
          <div><dt>מחיר הספק</dt><dd><bdi>{sourcePrice || "—"}</bdi></dd></div>
          <div><dt>וריאציות זמינות אצל הספק</dt><dd>{available} מתוך {p.variants.length}</dd></div>
        </dl>
        <small>סריקה אחרונה · {localTime.format(new Date(row.scanned_at))}</small>
        <div className="supplier-toolbar supplier-product-links">
          <button type="button" className="btn btn-line" disabled={pending} onClick={() => run("scan")}>
            {busy === "scan" ? "סורק…" : "סרוק עכשיו"}
          </button>
          <a href={p.url} target="_blank" rel="noreferrer">מוצר המקור ↗</a>
          {siteUrl && <a href={siteUrl} target="_blank" rel="noreferrer">למוצר באתר ↗</a>}
          {shopifyUrl && <a href={shopifyUrl} target="_blank" rel="noreferrer">למוצר ב־Shopify ↗</a>}
        </div>
      </div>
    </div>

    {scanError && <p className="supplier-product-warning" role="alert">נתוני הסריקה דורשים בדיקה · {scanError}</p>}

    <form className="supplier-product-form" onSubmit={publish} aria-busy={pending}>
      <div className="supplier-product-publishing">
        <section className="supplier-product-card" aria-labelledby="supplier-brand-title">
          <h3 id="supplier-brand-title">מותג המוצר</h3>
          {linked ? <strong><bdi>{brand.name || "חסר מותג"}</bdi></strong> :
            <input id="supplier-product-brand" aria-labelledby="supplier-brand-title" name="brand" maxLength={150}
              value={currentBrand} disabled={pending} onChange={event => setEditedBrand(event.target.value)}
              placeholder="הזנת שם מותג" aria-describedby={brandWarning ? "supplier-brand-warning" : undefined} />}
          {brandWarning ? <p className="supplier-product-warning" id="supplier-brand-warning" role="status">
            {linked && !brand.name ? (siteUrl ? "למוצר אין מותג ב־Shopify. אפשר לעדכן אותו בכרטיס המוצר." : "חסר מותג במוצר המקושר ב־Shopify.") : brandWarning}
          </p> : !linked && editedBrand === null && <small>
            {brand.evidence === "title" ? "זוהה לפי שם המוצר" : brand.evidence === "supplier-default" ?
              "מותג ברירת המחדל של הספק" : "מופיע בנתוני הספק"}
          </small>}
        </section>

        <section className="supplier-product-card" aria-labelledby="supplier-placement-title">
          <h3 id="supplier-placement-title">{siteUrl ? "מיקום המוצר באתר" : "מיקום המוצר לאחר הפרסום"}</h3>
          {paths.length ? <ul className="supplier-product-paths">
            {paths.map(path => <li key={JSON.stringify([path.parentId, path.sub])}>
              <strong>{path.parent}</strong>
              {path.sub ? <><IconFwd /><span>{path.sub}</span></> : <small>קטגוריה ראשית</small>}
            </li>)}
          </ul> : !showProposal && <p className="supplier-product-warning">{picked.length
            ? "לאוספים שנבחרו אין מיקום בקטגוריות האתר."
            : "יש לבחור אוסף Shopify כדי לראות את הקטגוריה ותת־הקטגוריה באתר."}</p>}
          {withoutPath.length > 0 && <ul className="supplier-product-unplaced">
            {withoutPath.map(collection => <li key={collection.id}><bdi>{collection.title}</bdi>
              <small>{collection.published ? "טרם חובר לקטגוריה באתר" : "האוסף טרם פורסם לערוץ האתר"}</small>
            </li>)}
          </ul>}
          {showProposal && <p className="supplier-product-warning">הצעת שיוך · {proposedCategory.parent} / {proposedCategory.sub}</p>}
          {(!paths.length || showProposal) && <Link href={supplierUrl(domain, "category-review")} prefetch={false}>לבדיקת קטגוריות</Link>}
          {!linked && <details className="supplier-product-collection-picker">
            <summary>{picked.length ? `עריכת אוספי Shopify · ${picked.length} נבחרו` : "בחירת אוספי Shopify"}</summary>
            <label className="supplier-product-collection-search"><IconSearch size={16} />
              <input type="search" aria-label="חיפוש אוסף או קטגוריה" placeholder="חיפוש אוסף או קטגוריה"
                value={search} onChange={event => setSearch(event.target.value)} />
            </label>
            <div className="supplier-product-collection-options" role="group" aria-label="אוספים לבחירה">
              {visibleCollections.map(collection => <label key={collection.id}>
                <input type="checkbox" checked={ids.includes(collection.id)} disabled={pending}
                  onChange={event => setEditedCollections({ initial, ids: event.target.checked
                    ? [...ids, collection.id] : ids.filter(id => id !== collection.id) })} />
                <span>{collection.title}
                  {collection.paths.length > 0 && <small>{collection.paths.map(path => [path.parent, path.sub].filter(Boolean).join(" / ")).join(" · ")}</small>}
                </span>
              </label>)}
              {!visibleCollections.length && <p>לא נמצאו אוספים מתאימים.</p>}
            </div>
          </details>}
        </section>
      </div>

      {canPublish && <div className="supplier-product-submit">
        <div>
          <strong>{storePrice ? `מחיר באתר · ${storePrice}` : "נדרש מחיר בשקלים לפני הפרסום"}</strong>
          {!storePrice && <Link href={supplierUrl(domain, "catalog") + "#catalog-item-" + id}>להגדרת מחיר בקטלוג הספק</Link>}
        </div>
        <button type="submit" className="btn admin-primary" disabled={pending || !!scanError || !linked && (!picked.length || !storePrice)}>
          {busy === "publish" ? "מפרסם ומאמת זמינות…" : "פרסם באתר"}
        </button>
      </div>}
      {canPublish && !linked && <dialog className="supplier-dialog supplier-publish-dialog" ref={confirmPublish}
        aria-labelledby="supplier-card-publish-title">
        <header><h2 id="supplier-card-publish-title">פרסום באתר</h2></header>
        <p>המוצר יעלה למכירה במחיר שהוגדר, לאחר אימות התמונות, האוספים והזמינות לפי צבע ומידה.</p>
        <div className="supplier-batch-buttons">
          <button type="button" className="btn btn-line" onClick={() => confirmPublish.current?.close()}>ביטול</button>
          <button type="button" className="btn admin-primary" onClick={publishUnlinked}>אישור פרסום באתר</button>
        </div>
      </dialog>}
      {feedback && <p className="admin-feedback" data-ok={feedback.ok} role={feedback.ok ? "status" : "alert"}>{feedback.message}</p>}
    </form>

    <details className="supplier-product-specs">
      <summary>מידות, צבעים ומלאי <span>{p.variants.length} וריאציות</span></summary>
      <div className="supplier-table">
        <table>
          <thead><tr><th>תמונה</th><th>וריאציה</th><th>מק״ט</th><th>מחיר מקור</th><th>מחיר בחנות</th><th>זמינות</th></tr></thead>
          <tbody>{p.variants.map(variant => <tr key={variant.id}>
            <td><img loading="lazy" src={variant.image} alt="" /></td>
            <td>{Object.values(variant.options).join(" · ")}</td>
            <td><bdi>{variant.sku}</bdi></td>
            <td><bdi>{priceRange([catalogPrice(variant.price, variant.regular)], p.currency || "ILS")}</bdi></td>
            <td><bdi>{finalPrices[variant.id] !== undefined ? priceRange([finalPrices[variant.id]], "ILS") : "נדרש מחיר"}</bdi></td>
            <td><span className="supplier-variant-stock" data-available={variant.available}>{variant.available ? "זמין" : "אזל"}</span></td>
          </tr>)}</tbody>
        </table>
      </div>
    </details>

    {(p.description.length > 0 || !!p.attributes?.length) && <details className="supplier-product-specs">
      <summary>תיאור ומפרט</summary>
      <div className="supplier-product-description">
        {p.description.map((line, index) => <p key={index}>{line}</p>)}
        {p.attributes?.map(attribute => <p key={attribute.name}>
          <strong>{attribute.name}</strong> · {attribute.values.join(" · ")}
        </p>)}
      </div>
    </details>}
  </article>;
}

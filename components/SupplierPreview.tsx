"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Preview } from "@/lib/suppliers/storage";
import { productBrand } from "@/lib/suppliers/catalog-model";

type Props = {
  id: string;
  model: string;
  row?: Pick<Preview, "snapshot" | "scanned_at" | "revision" | "verified_at">;
  collections: { id: string; title: string }[];
  selected: string[];
  draftUrl?: string;
  siteUrl?: string;
  canPublish: boolean;
  domain: string;
  finalPrices: Record<string, number>;
  scanError: string | null;
};
const localTime = new Intl.DateTimeFormat("he-IL", {
  timeZone: "Asia/Jerusalem",
  dateStyle: "short",
  timeStyle: "short",
});
export function SupplierPreview({
  id,
  model,
  row,
  collections,
  selected,
  draftUrl,
  siteUrl,
  canPublish,
  domain,
  finalPrices,
  scanError,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [refreshing, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ message: string; ok: boolean; url?: string }>();
  const pending = !!busy || refreshing;
  async function run(action: string, form = new FormData()) {
    if (pending) return;
    setBusy(action);
    setFeedback(undefined);
    form.set("action", action);
    form.set("id", id);
    form.set("domain", domain);
    if (row) form.set("revision", row.revision);
    try {
      const response = await fetch("/admin/suppliers", { method: "POST", body: form });
      const data = await response.json();
      setFeedback({ ok: response.ok, message: data.message, url: data.url });
      startTransition(() => router.refresh());
    } catch {
      setFeedback({ ok: false, message: "החיבור נקטע. רעננו ובדקו את מצב הטיוטה." });
    } finally {
      setBusy("");
    }
  }
  const p = row?.snapshot;
  const price = p?.variants[0];
  const link = feedback?.url ?? draftUrl;
  return (
    <article className="admin-panel supplier-preview">
      <header className="supplier-intro">
        {p && <img className="supplier-cover" src={p.images[0]} alt={p.title} />}
        <div>
          <h2>{p?.title ?? model}</h2>
          {p && (
            <>
              <p>{p.category}</p>
              {productBrand(p) && <p>מותג · {productBrand(p)}</p>}
              <small>סריקה אחרונה · {localTime.format(new Date(row!.scanned_at))}</small>
              {siteUrl ? (
                <p>
                  <a href={siteUrl} target="_blank" rel="noreferrer">
                    פורסם · צפייה במוצר באתר ↗
                  </a>
                </p>
              ) : (
                row?.verified_at && (
                  <p>
                    <small>הטיוטה נבדקה בשופיפיי · {localTime.format(new Date(row.verified_at))}</small>
                  </p>
                )
              )}
            </>
          )}
        </div>
        <button className="btn btn-line" disabled={pending} onClick={() => run("scan")}>
          {busy === "scan" ? "סורק…" : "סרוק עכשיו"}
        </button>
      </header>
      {scanError && <p role="alert">נתוני הסריקה האחרונה דורשים בדיקה · {scanError}</p>}
      {p && price && (
        <>
          <div className="supplier-facts">
            <b>
              מחיר המקור {price.price} {p.currency || "ILS"}
            </b>
            {price.regular > price.price && (
              <span>
                מחיר רגיל {price.regular} {p.currency || "ILS"}
              </span>
            )}
            <span>
              {p.variants.filter((v) => v.available).length} מתוך {p.variants.length} וריאציות זמינות אצל הספק
            </span>
            <a href={p.url} target="_blank" rel="noreferrer">
              מוצר המקור ↗
            </a>
          </div>
          <details>
            <summary>גלריה ותיאור · {p.images.length} תמונות</summary>
            <div className="supplier-gallery">
              {p.images.map((url, i) => (
                <a key={url} href={url} target="_blank" rel="noreferrer">
                  <img loading="lazy" src={url} alt={`${p.title} · תמונה ${i + 1}`} />
                </a>
              ))}
            </div>
            {p.description.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
            {p.attributes?.map((a) => (
              <p key={a.name}>
                <strong>{a.name}</strong> · {a.values.join(" · ")}
              </p>
            ))}
          </details>
          <details>
            <summary>מידות, צבעים ומלאי · {p.variants.length} וריאציות</summary>
            <div className="supplier-table">
              <table>
                <thead>
                  <tr>
                    <th>תמונה</th>
                    <th>וריאציה</th>
                    <th>מק״ט</th>
                    <th>מחיר מקור</th>
                    <th>מחיר בחנות</th>
                    <th>זמינות אצל הספק</th>
                  </tr>
                </thead>
                <tbody>
                  {p.variants.map((v) => (
                    <tr key={v.id}>
                      <td>
                        <img loading="lazy" src={v.image} alt="" />
                      </td>
                      <td>{Object.values(v.options).join(" · ")}</td>
                      <td>{v.sku}</td>
                      <td>
                        {v.price} {p.currency || "ILS"}
                      </td>
                      <td>{finalPrices[v.id] !== undefined ? finalPrices[v.id] + " ₪" : "נדרש מחיר"}</td>
                      <td>{v.available ? "זמין" : "אזל"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void run("import", new FormData(event.currentTarget));
            }}
          >
            {!link && (
              <label>
                מותג המוצר
                <input
                  name="brand"
                  maxLength={150}
                  defaultValue={productBrand(p)}
                  placeholder="שם המותג, אם ידוע"
                />
              </label>
            )}
            {link ? (
              <div>
                <strong>אוספים במוצר</strong>
                <p>
                  {collections
                    .filter((c) => selected.includes(c.id))
                    .map((c) => c.title)
                    .join(" · ")}
                </p>
                {selected.map((id) => (
                  <input key={id} type="hidden" name="collection" value={id} />
                ))}
              </div>
            ) : (
              <label>
                אוספי Shopify <small>ניתן לבחור מספר אוספים</small>
                <select
                  multiple
                  size={4}
                  required
                  name="collection"
                  key={selected.join(",")}
                  defaultValue={selected}
                >
                  {collections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="supplier-facts">
              {canPublish && (
                <button
                  type="button"
                  className="btn admin-primary"
                  disabled={pending}
                  onClick={() => run("publish")}
                >
                  {busy === "publish" ? "מפרסם ובודק זמינות…" : "פרסם באתר"}
                </button>
              )}
              {!siteUrl && (
                <button
                  disabled={pending || !collections.length || !!scanError}
                  className={canPublish ? "btn btn-line" : "btn admin-primary"}
                >
                  {busy === "import" ? "בודק בשופיפיי…" : link ? "בדיקת הטיוטה" : "ייבוא כטיוטה"}
                </button>
              )}
              {link && (
                <a href={link} target="_blank" rel="noreferrer">
                  {siteUrl ? "פתיחת המוצר בשופיפיי ↗" : "פתיחת הטיוטה בשופיפיי ↗"}
                </a>
              )}
            </div>
            {(canPublish || siteUrl) && (
              <small>
                הזמינות מתעדכנת בפרסום ובלחיצה על ״סרוק עכשיו״. כשהספק מדווח שיש מלאי, אפשר להזמין גם מעבר לכמות
                המקומית. כשהמלאי אצל הספק אוזל, המכירה מוגבלת למלאי המקומי.
              </small>
            )}
          </form>
        </>
      )}
      {feedback && (
        <p className="admin-feedback" data-ok={feedback.ok} role="status">
          {feedback.message}
        </p>
      )}
    </article>
  );
}

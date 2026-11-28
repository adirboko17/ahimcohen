"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SERVICES, colorLabel, type Product } from "@/lib/catalog";
import { useCatalog } from "@/lib/catalog-context";
import { categoryProductImage } from "@/lib/category-filters";
import { productSizeOptions } from "@/lib/sizes";
import { brandingOptions, businessProductOptions, logoError, logoExtensions, maxQuantity, maxQuoteItems, type ProductOption } from "@/lib/business-quotes";
import { IconBack, IconBag, IconCheck, IconFwd, IconUpload } from "./icons";
import { ProductImage } from "./ProductImage";

type Row = { id: number; pid: string; sku: string; color: string; sizes: Record<string, string> };
const LABELS = ["פריטים וכמויות", "מיתוג", "פרטי התקשרות", "סיכום ושליחה"];
const TITLES = [
  ["אילו פריטים צריך?", "בחרו פריט מהתמונות, ואז הגדירו צבע וכמות לכל מידה."],
  ["איך ממתגים?", "אפשר לבחור הדפס כיס, הדפס גב או את שניהם. אם הלוגו עדיין לא מוכן, אפשר לשלוח אותו בהמשך."],
  ["למי לשלוח את ההצעה?", "הצעת המחיר תישלח לפרטים האלה."],
  ["בדיקה אחרונה", "עברו על הפרטים לפני השליחה. אפשר לחזור לכל שלב ולערוך."],
];

function sizedOptions(product: Product, color: string) {
  return productSizeOptions(product, color).filter((option) => option.value);
}

export function BusinessView() {
  const { products: catalogProducts, product } = useCatalog();
  const products = useMemo(() => businessProductOptions(catalogProducts), [catalogProducts]);
  const formRef = useRef<HTMLElement>(null);
  const nextRowId = useRef(0);
  const pendingFocus = useRef<number | "picker" | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [pickerOpen, setPickerOpen] = useState(true);
  const [brand, setBrand] = useState<string[]>(["הדפס כיס"]);
  const [logo, setLogo] = useState<File | null>(null);
  const activeLogo = brand.includes("ללא מיתוג") ? null : logo;
  const [sending, setSending] = useState(false);
  const submission = useRef("");
  const [step, setStep] = useState(0);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);
  const [ct, setCt] = useState({ org: "", name: "", phone: "", email: "", notes: "" });
  const units = rows.reduce((a, r) => a + Object.values(r.sizes).reduce((s, v) => s + (+v || 0), 0), 0);
  const brandLabel = brand.length ? brand.join(" + ") : "לא נבחר";

  useEffect(() => {
    const target = pendingFocus.current;
    if (step !== 0 || target === null) return;
    pendingFocus.current = null;
    const selector = target === "picker" ? ".business-product-picker" : `[data-business-row="${target}"]`;
    const section = formRef.current?.querySelector(selector);
    section?.querySelector<HTMLElement>(target === "picker" ? "button" : "select")?.focus({ preventScroll: true });
    section?.scrollIntoView({ behavior: "instant", block: "start" });
  }, [pickerOpen, rows, step]);

  const selectProduct = ({ sku, product }: ProductOption) => {
    const row = { id: nextRowId.current++, pid: product.id, sku, color: product.colors[0] ?? "", sizes: {} };
    pendingFocus.current = row.id;
    setRows((current) => [...current, row]);
    setPickerOpen(false);
    setErr("");
  };

  const updateRow = (id: number, update: (row: Row) => Row) => {
    setRows((current) => current.map((row) => row.id === id ? update(row) : row));
  };

  const removeRow = (index: number) => {
    const remaining = rows.filter((_, i) => i !== index);
    pendingFocus.current = remaining[Math.min(index, remaining.length - 1)]?.id ?? "picker";
    setRows(remaining);
    if (!remaining.length) setPickerOpen(true);
  };

  const scrollForm = () => {
    const el = formRef.current;
    el?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  };
  const valid = (i: number) => {
    if (i === 0) return rows.length > 0 && rows.every(row => {
      const quantities = Object.values(row.sizes).map(Number);
      return quantities.some(q => q > 0) && quantities.every(q => Number.isInteger(q) && q >= 0 && q <= maxQuantity);
    });
    if (i === 1) return brand.length > 0;
    return i !== 2 || !!(ct.org.trim() && ct.name.trim() && ct.phone.trim());
  };
  const errs = [rows.length ? "הזינו כמויות שלמות ולפחות יחידה אחת בכל פריט" : "בחרו פריט כדי להתחיל", "בחרו מיקום הדפס או ללא מיתוג", "מלאו שם עסק, איש קשר וטלפון", ""];
  const go = (i: number) => {
    if (sending) return;
    for (let j = 0; j < i; j++) {
      if (!valid(j)) {
        setStep(j);
        setErr(errs[j]);
        return;
      }
    }
    setStep(i);
    setErr("");
    scrollForm();
  };

  const submit = async () => {
    if (sending) return;
    for (let j = 0; j < 3; j++) if (!valid(j)) { setStep(j); setErr(errs[j]); return; }
    setErr("");
    setSending(true);
    try {
      submission.current ||= crypto.randomUUID();
      const form = new FormData();
      form.set("submission", submission.current);
      const items = rows.map(({ pid, sku, color, sizes }) => ({ pid, sku, color,
        sizes: Object.fromEntries(Object.entries(sizes).filter(([, q]) => +q > 0).map(([size, q]) => [size, Number(q)])),
      }));
      form.set("quote", JSON.stringify({ contact: ct, branding: brand, items }));
      if (activeLogo) form.set("logo", activeLogo);
      const response = await fetch("/api/business-quotes", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok || !result.id) { setErr(result.message || "שליחת הבקשה נכשלה. נסו שוב."); return; }
      setSent(true);
      scrollForm();
    } catch {
      setErr("לא התקבל אישור שליחה. הפרטים נשמרו בטופס ואפשר לנסות שוב.");
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="business-page">
      <section className="wrap business-intro" aria-labelledby="business-title">
        <div>
          <span className="kicker">
            <span className="sq" />
            הזמנות לעסקים וארגונים
          </span>
          <h1 id="business-title" className="k business-title">
            ביגוד ממותג לכל הצוות.
          </h1>
          <p className="business-lead">ביגוד עבודה, ייצוג ומיגון עם הלוגו שלכם. בוחרים פריטים, מידות וכמויות - ומרכיבים בקשה להצעת מחיר לכל הצוות.</p>
        </div>
        <div className="business-intro-actions">
          <button className="btn" onClick={scrollForm}>לבניית בקשה להצעת מחיר <IconFwd /></button>
          <a href="tel:08-6233803">מעדיפים לדבר? <b dir="ltr">08-6233803</b></a>
        </div>
      </section>
      <section className="wrap" aria-label="פתרונות לעסק שלכם">
        <div className="business-services">
          {SERVICES.map((sv) => (
            <div key={sv.t} className="business-service">
              <span className="k">{sv.t}</span>
              <span style={{ fontSize: 15, lineHeight: 1.55, fontWeight: 500 }}>{sv.d}</span>
            </div>
          ))}
        </div>
      </section>
      <section ref={formRef} className="wrap business-request" aria-labelledby="business-request-title">
        <div className="business-request-heading">
          <h2 id="business-request-title" className="k">בקשה להצעת מחיר</h2>
          <span className="muted">פריטים, מיתוג ופרטי העסק - במקום אחד</span>
        </div>
        {sent ? (
          <div style={{ background: "#F4F4F2", padding: "clamp(28px, 5vw, 56px)", display: "flex", flexDirection: "column", gap: 14, alignItems: "flex-start" }}>
            <span style={{ width: 48, height: 48, background: "#FFD100", display: "flex", alignItems: "center", justifyContent: "center" }}><IconCheck size={22} /></span>
            <span role="status" style={{ fontSize: 28, fontWeight: 800 }}>הבקשה להצעת מחיר התקבלה</span>
            <span className="muted" style={{ fontSize: 16, lineHeight: 1.6, maxWidth: "52ch" }}>
              {ct.name}, קיבלנו את הבקשה של {ct.org} עבור {units} יחידות. צוות ההזמנות יחזור אליכם עם הצעת מחיר.
            </span>
            <a className="btn btn-line" href="/business">בקשה חדשה</a>
          </div>
        ) : (
          <div className="business-layout">
            <div className="business-form">
              <ol className="b-steps" aria-label="שלבי הבקשה">
                {LABELS.map((label, i) => (
                  <li key={label}>
                    <button onClick={() => go(i)} aria-current={i === step ? "step" : undefined}>
                      <span className={`bar ${i <= step ? "on" : ""}`} />
                      <span className="business-step-name">
                        <span className={`num ${i === step ? "now" : i < step ? "done" : ""}`}>{i + 1}</span>
                        <span className="business-step-label" style={{ fontWeight: i === step ? 800 : 600, color: i <= step ? "#111" : "#666660" }}>{label}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
              <div className="business-panel">
                <div className="business-step-heading">
                  <div className="muted" style={{ fontSize: 14, fontWeight: 700 }}>שלב {step + 1} מתוך 4</div>
                  <h3 className="k">{TITLES[step][0]}</h3>
                  <p className="muted" style={{ fontSize: 16, lineHeight: 1.55, maxWidth: "56ch" }}>{TITLES[step][1]}</p>
                </div>
                {step === 0 && (
                  <div className="business-items">
                    {pickerOpen && (
                      <div className="business-product-picker">
                        {products.length ? (
                          <div className="business-product-grid" role="group" aria-label="פריטים לבחירה">
                            {products.map((option) => (
                              <button key={option.sku} type="button" className="business-product-option" onClick={() => selectProduct(option)}>
                                <span className="business-product-photo">
                                  {option.product.imgs?.[0]
                                    ? <ProductImage src={option.product.imgs[0]} alt="" sizes="(max-width: 767px) 42vw, 240px" maxWidth={480} />
                                    : <IconBag size={34} />}
                                </span>
                                <span className="business-product-info">
                                  <span className="business-product-sku">מק״ט <bdi>{option.sku}</bdi></span>
                                  <span className="business-product-name" dir="auto">{option.product.name}</span>
                                  <span className="business-product-add" aria-hidden="true">+</span>
                                </span>
                              </button>
                            ))}
                          </div>
                        ) : <p className="muted">אין כרגע פריטים זמינים לבחירה.</p>}
                        {rows.length > 0 && <button className="business-row-link" type="button" onClick={() => {
                          pendingFocus.current = rows[rows.length - 1].id;
                          setPickerOpen(false);
                        }}>חזרה לפריטים שנבחרו</button>}
                      </div>
                    )}
                    {rows.map((r, ri) => {
                      const rp = product(r.pid);
                      if (!rp) return null;
                      const sum = Object.values(r.sizes).reduce((a, b) => a + (+b || 0), 0);
                      const sizes = sizedOptions(rp, r.color);
                      const image = categoryProductImage(rp, { colors: r.color ? [r.color] : [], sizes: [], stock: false });
                      return (
                        <div className="b-card business-item" key={r.id} data-business-row={r.id}>
                          <div className="business-item-heading">
                            <span className="business-item-photo">
                              {image ? <ProductImage src={image} alt="" sizes="64px" maxWidth={160} width={64} height={64} /> : <IconBag size={26} />}
                            </span>
                            <div className="business-item-name">
                              <span className="business-product-sku">מק״ט <bdi>{r.sku}</bdi></span>
                              <h4 dir="auto">{rp.name}</h4>
                            </div>
                            <button className="business-row-link" type="button" aria-label={`הסרת ${rp.name}`} onClick={() => removeRow(ri)}>הסרה</button>
                          </div>
                          <div className="business-item-options">
                            <label className="field">צבע
                              <select value={r.color} onChange={(e) => {
                                const color = e.target.value;
                                const labels = new Set(sizedOptions(rp, color).map((option) => option.label));
                                updateRow(r.id, (row) => ({ ...row, color, sizes: Object.fromEntries(Object.entries(row.sizes).filter(([label]) => labels.has(label))) }));
                              }}>
                                {(rp.colors.length ? rp.colors : [""]).map((c) => <option key={c} value={c}>{c ? colorLabel(c) : "ללא"}</option>)}
                              </select>
                            </label>
                            <div>
                              <span className="business-size-label">כמות לפי מידה</span>
                              <div className="business-size-grid">
                                {sizes.map(({ label }) => (
                                  <label key={label}>
                                    <bdi>{label}</bdi>
                                    <input className="inp" type="number" min={0} max={maxQuantity} inputMode="numeric" placeholder="0" value={r.sizes[label] || ""} onChange={(e) => {
                                      const value = e.target.value;
                                      updateRow(r.id, (row) => ({ ...row, sizes: { ...row.sizes, [label]: value } }));
                                    }} />
                                  </label>
                                ))}
                              </div>
                            </div>
                          </div>
                          <b className="business-item-quantity">{sum ? `${sum} יחידות` : "טרם הוזנו כמויות"}</b>
                        </div>
                      );
                    })}
                    {!pickerOpen && rows.length < maxQuoteItems && <button className="business-add-product btn btn-line" type="button" onClick={() => {
                      pendingFocus.current = "picker";
                      setPickerOpen(true);
                    }}>+ הוספת פריט</button>}
                  </div>
                )}
                {step === 1 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: 8 }}>
                      {Object.entries(brandingOptions).map(([b, description]) => {
                        const on = brand.includes(b);
                        return (
                          <button key={b} aria-pressed={on} className={`choice ${on ? "on" : ""}`} onClick={() => setBrand((cur) => {
                            if (b === "ללא מיתוג") return cur.includes(b) ? [] : [b];
                            const without = cur.filter((x) => x !== "ללא מיתוג");
                            return without.includes(b) ? without.filter((x) => x !== b) : without.concat(b);
                          })}>
                            <span className={`tick ${on ? "on" : ""}`} style={{ width: 24, height: 24 }}>{on && <IconCheck />}</span>
                            <span>
                              <b style={{ display: "block", fontSize: 18 }}>{b}</b>
                              <span className="muted" style={{ fontSize: 14 }}>{description}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {!brand.includes("ללא מיתוג") && <label style={{ display: "flex", alignItems: "center", gap: 16, background: "#fff", padding: 22, cursor: "pointer", boxShadow: "inset 0 0 0 1px #CFCFCA", position: "relative" }}>
                      <span style={{ width: 52, height: 52, background: "#FFD100", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}><IconUpload /></span>
                      <span>
                        <b style={{ display: "block", fontSize: 16 }}>{logo?.name || "העלאת קובץ לוגו"}</b>
                        <span className="muted" style={{ fontSize: 13 }}>PNG, JPG, PDF, AI, SVG או EPS · עד 4 MB · לא חובה</span>
                      </span>
                      <input type="file" accept={logoExtensions.join(",")} style={{ position: "absolute", inset: 0, opacity: 0, width: "100%", cursor: "pointer" }} onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const message = logoError(file);
                        setErr(message);
                        if (!message) setLogo(file);
                        e.target.value = "";
                      }} />
                    </label>}
                    {activeLogo && <button className="business-row-link" onClick={() => { setLogo(null); setErr(""); }}>הסרת הלוגו</button>}
                  </div>
                )}
                {step === 2 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: 14 }}>
                      <label className="field">שם העסק / הארגון *<input maxLength={200} value={ct.org} onChange={(e) => setCt({ ...ct, org: e.target.value })} /></label>
                      <label className="field">איש קשר *<input maxLength={200} value={ct.name} onChange={(e) => setCt({ ...ct, name: e.target.value })} /></label>
                      <label className="field">טלפון *<input type="tel" maxLength={40} value={ct.phone} onChange={(e) => setCt({ ...ct, phone: e.target.value })} dir="ltr" style={{ textAlign: "right" }} /></label>
                      <label className="field">אימייל<input type="email" maxLength={254} value={ct.email} onChange={(e) => setCt({ ...ct, email: e.target.value })} dir="ltr" style={{ textAlign: "right" }} /></label>
                    </div>
                    <label className="field">הערות - מועד אספקה רצוי, מיקום הלוגו<textarea rows={4} maxLength={4000} value={ct.notes} onChange={(e) => setCt({ ...ct, notes: e.target.value })} /></label>
                  </div>
                )}
                {step === 3 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div className="b-card">
                      <div style={{ display: "flex", justifyContent: "space-between" }}><b>פריטים</b><button onClick={() => go(0)} style={{ background: "none", border: 0, fontWeight: 700, textDecoration: "underline" }}>עריכה</button></div>
                      {rows.map((r) => {
                        const rp = product(r.pid);
                        if (!rp) return null;
                        const ent = Object.entries(r.sizes).filter(([, v]) => +v > 0);
                        const n = ent.reduce((a, [, v]) => a + +v, 0);
                        return (
                          <div key={r.id} style={{ display: "flex", justifyContent: "space-between", gap: 16, borderTop: "1px solid #EFEFEC", paddingTop: 12 }}>
                            <span>
                              <b style={{ display: "block" }}>{rp.name}{r.color ? " · " + colorLabel(r.color) : ""}</b>
                              <span className="business-product-sku">מק״ט <bdi>{r.sku}</bdi></span>
                              <span className="muted" dir="ltr" style={{ display: "block", textAlign: "right" }}>{ent.length ? ent.map(([z, v]) => `${z} × ${v}`).join("   ") : "ללא כמויות"}</span>
                            </span>
                            <b>{n} יח׳</b>
                          </div>
                        );
                      })}
                    </div>
                    <div className="b-card" style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <span><b style={{ display: "block" }}>מיתוג</b><span className="muted">{brandLabel}{activeLogo ? " · " + activeLogo.name : brand.includes("ללא מיתוג") ? "" : " · טרם צורף לוגו"}</span></span>
                      <button onClick={() => go(1)} style={{ background: "none", border: 0, fontWeight: 700, textDecoration: "underline" }}>עריכה</button>
                    </div>
                    <div className="b-card" style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <span><b style={{ display: "block" }}>פרטי התקשרות</b><span className="muted">{[ct.org, ct.name, ct.phone, ct.email].filter(Boolean).join(" · ")}{ct.notes ? " - " + ct.notes : ""}</span></span>
                      <button onClick={() => go(2)} style={{ background: "none", border: 0, fontWeight: 700, textDecoration: "underline" }}>עריכה</button>
                    </div>
                  </div>
                )}
                {step >= 2 && <p className="policy-note">מסירת הפרטים היא לבחירתכם. פרטי קשר דרושים לצוות האחים כהן כדי לחזור אליכם עם הצעה. <a href="/info/privacy">מי מקבל את המידע וזכויות עיון ותיקון</a></p>}
                {err && <span className="err" role="alert">{err}</span>}
                <div className="business-form-actions">
                  {step > 0 && <button disabled={sending} className="btn btn-line" style={{ padding: "0 24px" }} onClick={() => go(step - 1)}><IconBack /> חזרה</button>}
                  <button disabled={sending} className="btn" style={{ flex: 1, fontSize: 16 }} onClick={() => step < 3 ? go(step + 1) : void submit()}>
                    {step < 3 ? `המשך · ${LABELS[step + 1]}` : sending ? "שולחים את הבקשה…" : "שליחת בקשה להצעת מחיר"}
                    <IconFwd />
                  </button>
                </div>
              </div>
            </div>
            <aside className="business-summary" aria-label="סיכום הבקשה">
              <div className="summary-card">
                <span style={{ fontSize: 15, fontWeight: 700 }}>הבקשה שלכם</span>
                <span style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
                  <span className="k">{units}</span>
                  <span style={{ fontSize: 16, fontWeight: 700, paddingBottom: 4 }}>יחידות</span>
                </span>
                <div style={{ borderTop: "1px solid #333" }}>
                  <Row k="פריטים" v={String(rows.length)} />
                  <Row k="מיתוג" v={brandLabel} />
                  {!brand.includes("ללא מיתוג") && <Row k="לוגו" v={activeLogo?.name || "טרם צורף"} />}
                </div>
              </div>
              <a href="tel:08-6233803" style={{ background: "#F4F4F2", padding: "18px 20px", display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                <span>מעדיפים לדבר?</span>
                <span dir="ltr" style={{ fontSize: 16, fontWeight: 800 }}>08-6233803</span>
              </a>
            </aside>
          </div>
        )}
      </section>
    </main>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <span className="business-summary-row">
      <span style={{ color: "#b5b5b0" }}>{k}</span>
      <span style={{ fontWeight: 700, textAlign: "left" }}>{v}</span>
    </span>
  );
}

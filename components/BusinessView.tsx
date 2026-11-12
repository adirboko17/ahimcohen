"use client";

import { useRef, useState } from "react";
import { SERVICES } from "@/lib/catalog";
import { useCatalog } from "@/lib/catalog-context";
import { IconBack, IconCheck, IconFwd, IconUpload } from "./icons";

type Row = { pid: string; color: number; sizes: Record<string, string> };
const LABELS = ["פריטים וכמויות", "מיתוג", "פרטי התקשרות", "סיכום ושליחה"];
const TITLES = [
  ["אילו פריטים צריך?", "בחרו פריט וצבע והזינו כמות לכל מידה. אפשר להוסיף כמה פריטים לאותה בקשה."],
  ["איך ממתגים?", "בחרו שיטת מיתוג והעלו את קובץ הלוגו. אם הקובץ לא זמין כרגע, אפשר לשלוח אותו גם אחר כך."],
  ["למי לשלוח את ההצעה?", "הצעת המחיר תישלח לפרטים האלה."],
  ["בדיקה אחרונה", "עברו על הפרטים לפני השליחה. אפשר לחזור לכל שלב ולערוך."],
];
const BRAND_DESC: Record<string, string> = { רקמה: "לוגו רקום על הבגד", הדפסה: "לוגו מודפס על הבגד", "ללא מיתוג": "פריטים ללא לוגו" };

export function BusinessView() {
  const { products: catalogProducts, product } = useCatalog();
  const formRef = useRef<HTMLElement>(null);
  const [rows, setRows] = useState<Row[]>([{ pid: "p1", color: 0, sizes: {} }]);
  const [brand, setBrand] = useState<string[]>(["רקמה"]);
  const [logo, setLogo] = useState("");
  const [step, setStep] = useState(0);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);
  const [ct, setCt] = useState({ org: "", name: "", phone: "", email: "", notes: "" });
  const products = catalogProducts.filter((item) => item.sizes.length > 0).slice(0, 40);
  const units = rows.reduce((a, r) => a + Object.values(r.sizes).reduce((s, v) => s + (+v || 0), 0), 0);
  const brandLabel = brand.length ? brand.join(" + ") : "לא נבחר";

  const scrollForm = () => {
    const el = formRef.current;
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 90, behavior: "smooth" });
  };
  const valid = (i: number) => (i === 0 ? units > 0 : i === 2 ? !!(ct.org && ct.name && ct.phone) : true);
  const errs = ["הזינו כמות לפחות במידה אחת", "", "מלאו שם עסק, איש קשר וטלפון", ""];
  const go = (i: number) => {
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

  return (
    <main>
      <section className="wrap" style={{ paddingTop: "clamp(28px, 5vw, 72px)" }}>
        <span className="kicker" style={{ marginBottom: 20 }}>
          <span className="sq" />
          הזמנות לעסקים וארגונים
        </span>
        <div className="hero">
          <h1 className="k hero-title">
            ביגוד ממותג
            <br />
            לכל הצוות.
          </h1>
          <div style={{ display: "flex", flexDirection: "column", gap: 22, paddingBottom: 8 }}>
            <p className="lead">ביגוד עבודה, ייצוגי ומיגון עם הדפסה או רקמה של הלוגו שלכם. מפרטים פריטים, כמויות ומידות לכל עובד — ומקבלים הצעת מחיר מסודרת.</p>
            <div className="hero-actions" style={{ maxWidth: 480 }}>
              <button className="btn btn-lg" onClick={scrollForm}>לטופס הצעת מחיר</button>
              <a href="tel:08-6233803" className="btn btn-line btn-lg" dir="ltr">08-6233803</a>
            </div>
          </div>
        </div>
      </section>
      <section className="wrap" style={{ paddingTop: "clamp(40px, 6vw, 80px)" }}>
        <div className="services">
          {SERVICES.map((sv) => (
            <div key={sv.t} className="service" style={{ background: sv.bg, color: sv.fg }}>
              <span className="k">{sv.t}</span>
              <span style={{ fontSize: 15, lineHeight: 1.55, fontWeight: 500 }}>{sv.d}</span>
            </div>
          ))}
        </div>
      </section>
      <section ref={formRef} className="wrap-s" style={{ paddingTop: "clamp(64px, 8vw, 120px)" }}>
        <h2 className="k sec-title" style={{ marginBottom: 28 }}>בקשה להצעת מחיר</h2>
        {sent ? (
          <div style={{ background: "#F4F4F2", padding: "clamp(28px, 5vw, 56px)", display: "flex", flexDirection: "column", gap: 14, alignItems: "flex-start" }}>
            <span style={{ width: 48, height: 48, background: "#FFD100", display: "flex", alignItems: "center", justifyContent: "center" }}><IconCheck size={22} /></span>
            <span style={{ fontSize: 28, fontWeight: 800 }}>הבקשה מוכנה לשליחה</span>
            <span className="muted" style={{ fontSize: 16, lineHeight: 1.6, maxWidth: "52ch" }}>
              {units} יחידות ב-{rows.length} פריטים{brand.length ? " · " + brand.join(" + ") : ""}{logo ? " · לוגו: " + logo : ""}. בסביבת ההדגמה הטופס אינו נשלח בפועל — בגרסה החיה הוא יועבר לצוות ההזמנות ב-Hazmanot@ahim-cohen.co.il.
            </span>
            <button className="btn btn-line" style={{ marginTop: 8, height: 50, padding: "0 24px" }} onClick={() => { setSent(false); setStep(3); }}>עריכת הבקשה</button>
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "clamp(16px, 2.5vw, 32px)", alignItems: "flex-start" }}>
            <div style={{ flex: "1 1 560px", minWidth: 0, display: "flex", flexDirection: "column", gap: 20 }}>
              <ol className="b-steps">
                {LABELS.map((label, i) => (
                  <li key={label}>
                    <button onClick={() => go(i)}>
                      <span className={`bar ${i <= step ? "on" : ""}`} />
                      <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span className={`num ${i === step ? "now" : i < step ? "done" : ""}`}>{i + 1}</span>
                        <span className={i === step ? undefined : "desk"} style={{ fontSize: 15, fontWeight: i === step ? 800 : 600, color: i <= step ? "#111" : "#8a8a86" }}>{label}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
              <div style={{ background: "#F4F4F2", padding: "clamp(20px, 3.5vw, 44px)", display: "flex", flexDirection: "column", gap: 24 }}>
                <div>
                  <div className="muted" style={{ fontSize: 14, fontWeight: 700 }}>שלב {step + 1} מתוך 4</div>
                  <div className="k" style={{ fontSize: "clamp(40px, 4.5vw, 60px)", lineHeight: 0.85, marginTop: 8 }}>{TITLES[step][0]}</div>
                  <p className="muted" style={{ fontSize: 16, lineHeight: 1.55, maxWidth: "56ch" }}>{TITLES[step][1]}</p>
                </div>
                {step === 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {rows.map((r, ri) => {
                      const rp = product(r.pid);
                      if (!rp) return null;
                      const sum = Object.values(r.sizes).reduce((a, b) => a + (+b || 0), 0);
                      const upd = (fn: (row: Row) => Row) => setRows((all) => all.map((x, j) => (j === ri ? fn(x) : x)));
                      return (
                        <div className="b-card" key={ri}>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: 10 }}>
                            <label className="field">פריט
                              <select value={r.pid} onChange={(e) => upd(() => ({ pid: e.target.value, color: 0, sizes: {} }))}>
                                {products.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                              </select>
                            </label>
                            <label className="field">צבע
                              <select value={r.color} onChange={(e) => upd((x) => ({ ...x, color: +e.target.value }))}>
                                {(rp.colors.length ? rp.colors : ["ללא"]).map((c, i) => <option key={c} value={i}>{c}</option>)}
                              </select>
                            </label>
                          </div>
                          <div>
                            <span style={{ fontSize: 14, fontWeight: 700 }}>כמות לפי מידה</span>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(64px, 1fr))", gap: 6, marginTop: 8 }}>
                              {rp.sizes.map((z) => (
                                <label key={z} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, fontSize: 13, fontWeight: 700, direction: "ltr" }}>
                                  {z}
                                  <input className="inp" type="number" min={0} inputMode="numeric" placeholder="0" value={r.sizes[z] || ""} onChange={(e) => upd((x) => ({ ...x, sizes: { ...x.sizes, [z]: e.target.value } }))} style={{ textAlign: "center", height: 46 }} />
                                </label>
                              ))}
                            </div>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                            <b>{sum ? `${sum} יחידות` : "טרם הוזנו כמויות"}</b>
                            {rows.length > 1 && <button onClick={() => setRows((all) => all.filter((_, j) => j !== ri))} style={{ background: "none", border: 0, textDecoration: "underline", fontWeight: 600 }}>הסרה</button>}
                          </div>
                        </div>
                      );
                    })}
                    <button className="btn btn-line" style={{ alignSelf: "flex-start", height: 46, padding: "0 18px", borderStyle: "dashed" }} onClick={() => setRows((all) => all.concat({ pid: "p3", color: 0, sizes: {} }))}>+ הוספת פריט</button>
                  </div>
                )}
                {step === 1 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: 8 }}>
                      {["רקמה", "הדפסה", "ללא מיתוג"].map((b) => {
                        const on = brand.includes(b);
                        return (
                          <button key={b} className={`choice ${on ? "on" : ""}`} onClick={() => setBrand((cur) => {
                            if (b === "ללא מיתוג") return cur.includes(b) ? [] : [b];
                            const without = cur.filter((x) => x !== "ללא מיתוג");
                            return without.includes(b) ? without.filter((x) => x !== b) : without.concat(b);
                          })}>
                            <span className={`tick ${on ? "on" : ""}`} style={{ width: 24, height: 24 }}>{on && <IconCheck />}</span>
                            <span>
                              <b style={{ display: "block", fontSize: 18 }}>{b}</b>
                              <span className="muted" style={{ fontSize: 14 }}>{BRAND_DESC[b]}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: 16, background: "#fff", padding: 22, cursor: "pointer", boxShadow: "inset 0 0 0 1px #CFCFCA" }}>
                      <span style={{ width: 52, height: 52, background: "#FFD100", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}><IconUpload /></span>
                      <span>
                        <b style={{ display: "block", fontSize: 16 }}>{logo || "העלאת קובץ לוגו"}</b>
                        <span className="muted" style={{ fontSize: 13 }}>PNG, JPG, PDF, AI או SVG · לא חובה בשלב זה</span>
                      </span>
                      <input type="file" accept=".png,.jpg,.jpeg,.pdf,.ai,.svg,.eps" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) setLogo(f.name); }} />
                    </label>
                  </div>
                )}
                {step === 2 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: 14 }}>
                      <label className="field">שם העסק / הארגון *<input value={ct.org} onChange={(e) => setCt({ ...ct, org: e.target.value })} /></label>
                      <label className="field">איש קשר *<input value={ct.name} onChange={(e) => setCt({ ...ct, name: e.target.value })} /></label>
                      <label className="field">טלפון *<input value={ct.phone} onChange={(e) => setCt({ ...ct, phone: e.target.value })} dir="ltr" style={{ textAlign: "right" }} /></label>
                      <label className="field">אימייל<input value={ct.email} onChange={(e) => setCt({ ...ct, email: e.target.value })} dir="ltr" style={{ textAlign: "right" }} /></label>
                    </div>
                    <label className="field">הערות — מועד אספקה רצוי, מיקום הלוגו<textarea rows={4} value={ct.notes} onChange={(e) => setCt({ ...ct, notes: e.target.value })} /></label>
                  </div>
                )}
                {step === 3 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div className="b-card">
                      <div style={{ display: "flex", justifyContent: "space-between" }}><b>פריטים</b><button onClick={() => go(0)} style={{ background: "none", border: 0, fontWeight: 700, textDecoration: "underline" }}>עריכה</button></div>
                      {rows.map((r, i) => {
                        const rp = product(r.pid);
                        if (!rp) return null;
                        const ent = Object.entries(r.sizes).filter(([, v]) => +v > 0);
                        const n = ent.reduce((a, [, v]) => a + +v, 0);
                        return (
                          <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 16, borderTop: "1px solid #EFEFEC", paddingTop: 12 }}>
                            <span>
                              <b style={{ display: "block" }}>{rp.name}{rp.colors[r.color] ? " · " + rp.colors[r.color] : ""}</b>
                              <span className="muted" dir="ltr" style={{ display: "block", textAlign: "right" }}>{ent.length ? ent.map(([z, v]) => `${z} × ${v}`).join("   ") : "ללא כמויות"}</span>
                            </span>
                            <b>{n} יח׳</b>
                          </div>
                        );
                      })}
                    </div>
                    <div className="b-card" style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <span><b style={{ display: "block" }}>מיתוג</b><span className="muted">{brandLabel}{logo ? " · לוגו: " + logo : " · לוגו יישלח בהמשך"}</span></span>
                      <button onClick={() => go(1)} style={{ background: "none", border: 0, fontWeight: 700, textDecoration: "underline" }}>עריכה</button>
                    </div>
                    <div className="b-card" style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <span><b style={{ display: "block" }}>פרטי התקשרות</b><span className="muted">{[ct.org, ct.name, ct.phone, ct.email].filter(Boolean).join(" · ")}{ct.notes ? " — " + ct.notes : ""}</span></span>
                      <button onClick={() => go(2)} style={{ background: "none", border: 0, fontWeight: 700, textDecoration: "underline" }}>עריכה</button>
                    </div>
                  </div>
                )}
                {err && <span className="err">{err}</span>}
                <div style={{ display: "flex", gap: 8, borderTop: "1px solid #DCDCD8", paddingTop: 20 }}>
                  {step > 0 && <button className="btn btn-line" style={{ height: 58, padding: "0 24px" }} onClick={() => { setStep(step - 1); setErr(""); scrollForm(); }}><IconBack /> חזרה</button>}
                  <button className="btn" style={{ flex: 1, height: 58, fontSize: 16 }} onClick={() => {
                    if (step < 3) { go(step + 1); return; }
                    for (let j = 0; j < 3; j++) if (!valid(j)) { setStep(j); setErr(errs[j]); return; }
                    setSent(true);
                    scrollForm();
                  }}>
                    {step < 3 ? `המשך · ${LABELS[step + 1]}` : "שליחת בקשה להצעת מחיר"}
                    <IconFwd />
                  </button>
                </div>
              </div>
            </div>
            <aside style={{ flex: "1 1 280px", position: "sticky", top: 160, display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="summary-card">
                <span style={{ fontSize: 15, fontWeight: 700 }}>הבקשה שלכם</span>
                <span style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
                  <span className="k">{units}</span>
                  <span style={{ fontSize: 16, fontWeight: 700, paddingBottom: 4 }}>יחידות</span>
                </span>
                <div style={{ borderTop: "1px solid #333" }}>
                  <Row k="פריטים" v={String(rows.length)} />
                  <Row k="מיתוג" v={brandLabel} />
                  <Row k="לוגו" v={logo || "טרם הועלה"} />
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
    <span style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "12px 0", borderBottom: "1px solid #333", fontSize: 14 }}>
      <span style={{ color: "#b5b5b0" }}>{k}</span>
      <span style={{ fontWeight: 700, textAlign: "left" }}>{v}</span>
    </span>
  );
}

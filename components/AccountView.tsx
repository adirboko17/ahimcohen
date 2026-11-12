"use client";

import { useEffect, useRef, useState } from "react";
import { ORDERS, phOf } from "@/lib/catalog";
import { useCatalog } from "@/lib/catalog-context";
import { fmt, priceFor } from "@/lib/pricing";
import { useStore } from "@/lib/store";
import { IconBack } from "./icons";

const STEPS = ["התקבלה", "בהכנה", "נשלחה", "נמסרה"];

export function AccountView() {
  const { auth, phone, login, logout, addMany, flash } = useStore();
  const { product } = useCatalog();
  const [stage, setStage] = useState<"phone" | "code">("phone");
  const [draft, setDraft] = useState(phone);
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [err, setErr] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [left, setLeft] = useState(0);
  const [tab, setTab] = useState("orders");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (left <= 0) return;
    const t = setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(t);
  }, [left]);

  const digits = (draft || "").replace(/\D/g, "");
  const masked = digits.length === 10 ? `${digits.slice(0, 3)}-•••-${digits.slice(6)}` : draft;
  const pretty = digits.length === 10 ? `${digits.slice(0, 3)}-${digits.slice(3)}` : draft;

  const send = () => {
    if (!/^05\d{8}$/.test(digits)) {
      setErr("הזינו מספר נייד תקין בן 10 ספרות");
      return;
    }
    setSending(true);
    setErr("");
    setTimeout(() => {
      setSending(false);
      setStage("code");
      setOtp(["", "", "", "", "", ""]);
      setLeft(30);
      setTimeout(() => refs.current[0]?.focus(), 60);
    }, 700);
  };

  const verify = (code: string[]) => {
    if (verifying) return;
    if (!code.every(Boolean)) {
      setErr("הזינו את כל 6 הספרות");
      return;
    }
    setVerifying(true);
    setErr("");
    setTimeout(() => {
      setVerifying(false);
      login(draft);
      setStage("phone");
      setOtp(["", "", "", "", "", ""]);
      setTab("orders");
      flash("התחברתם בהצלחה");
      window.scrollTo({ top: 0 });
    }, 800);
  };

  const setDigit = (i: number, raw: string) => {
    const next = otp.slice();
    const prev = next[i];
    let dg = raw.replace(/\D/g, "");
    if (prev && dg.length === 2) dg = dg[0] === prev ? dg[1] : dg[0];
    if (dg.length > 1) dg.slice(0, 6 - i).split("").forEach((c, k) => { next[i + k] = c; });
    else next[i] = dg;
    setOtp(next);
    setErr("");
    const nx = dg.length > 1 ? Math.min(5, i + dg.length) : i + 1;
    if (dg && nx <= 5) refs.current[nx]?.focus();
    if (next.every(Boolean)) verify(next);
  };

  if (!auth) {
    return (
      <main className="wrap" style={{ padding: "clamp(24px, 5vw, 72px) var(--gutter) clamp(56px, 7vw, 112px)" }}>
        <div className="account-grid">
          <div className="panel">
            {stage === "phone" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <span className="muted" style={{ fontSize: 14, fontWeight: 700 }}>כניסה / הרשמה</span>
                  <h1 className="k" style={{ fontSize: "clamp(52px, 6vw, 84px)", lineHeight: 0.82, margin: 0 }}>כניסה עם קוד לנייד</h1>
                  <p className="muted" style={{ margin: 0, fontSize: 17, lineHeight: 1.55, maxWidth: "44ch" }}>נשלח אליכם קוד חד־פעמי ב-SMS, בלי סיסמה. אם זו הפעם הראשונה שלכם, החשבון ייפתח אוטומטית.</p>
                </div>
                <label className="field">
                  מספר טלפון נייד
                  <input className="big" value={draft} onChange={(e) => { setDraft(e.target.value.replace(/[^\d-]/g, "").slice(0, 11)); setErr(""); }} onKeyDown={(e) => { if (e.key === "Enter") send(); }} type="tel" inputMode="numeric" autoComplete="tel" placeholder="050-0000000" dir="ltr" style={{ textAlign: "right", boxShadow: err ? "inset 0 0 0 2px #B3261E" : undefined }} />
                </label>
                {err && <span className="err" style={{ marginTop: -16 }}>{err}</span>}
                <button className="btn" style={{ height: 60, fontSize: 17 }} onClick={send}>{sending ? "שולחים קוד…" : "שליחת קוד ב-SMS"}</button>
                <span className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>בכניסה לחשבון אתם מאשרים את תקנון האתר ומדיניות הפרטיות.</span>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
                <button onClick={() => { setStage("phone"); setErr(""); }} style={{ background: "none", border: 0, fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, alignSelf: "flex-start" }}>
                  <IconBack /> שינוי מספר
                </button>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <h1 className="k" style={{ fontSize: "clamp(52px, 6vw, 84px)", lineHeight: 0.82, margin: 0 }}>הזנת קוד אימות</h1>
                  <p className="muted" style={{ margin: 0, fontSize: 17, lineHeight: 1.55 }}>
                    שלחנו קוד בן 6 ספרות למספר <span dir="ltr" style={{ fontWeight: 800, color: "#111" }}>{masked}</span>
                  </p>
                </div>
                <div className="otp">
                  {otp.map((v, i) => (
                    <input key={i} ref={(el) => { refs.current[i] = el; }} className={err ? "bad" : v ? "fill" : ""} value={v} inputMode="numeric" autoComplete="one-time-code" aria-label={`ספרה ${i + 1}`} onFocus={(e) => e.target.select()} onChange={(e) => setDigit(i, e.target.value)} onKeyDown={(e) => {
                      if (e.key === "Backspace" && !otp[i] && i > 0) {
                        const next = otp.slice();
                        next[i - 1] = "";
                        setOtp(next);
                        refs.current[i - 1]?.focus();
                        e.preventDefault();
                      }
                    }} />
                  ))}
                </div>
                {err && <span className="err" style={{ marginTop: -16 }}>{err}</span>}
                <button className="btn" style={{ height: 60, fontSize: 17, maxWidth: 440 }} onClick={() => verify(otp)}>{verifying ? "מאמתים…" : "אימות וכניסה"}</button>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontSize: 14 }}>
                  <span className="muted">לא קיבלתם קוד?</span>
                  {left <= 0 ? (
                    <button onClick={() => { setOtp(["", "", "", "", "", ""]); setErr(""); setLeft(30); flash("נשלח קוד חדש"); }} style={{ background: "none", border: 0, fontWeight: 700, textDecoration: "underline" }}>שליחה חוזרת</button>
                  ) : (
                    <span style={{ fontWeight: 700 }}>שליחה חוזרת בעוד 0:{String(left).padStart(2, "0")}</span>
                  )}
                </div>
                <span style={{ alignSelf: "flex-start", background: "#FFD100", padding: "8px 12px", fontSize: 13, fontWeight: 700 }}>הדגמה: כל קוד בן 6 ספרות יתקבל</span>
              </div>
            )}
          </div>
          <aside className="panel dark">
            <span className="k" style={{ fontSize: "clamp(44px, 4.5vw, 64px)", lineHeight: 0.85, color: "#FFD100" }}>באזור האישי</span>
            <div style={{ display: "flex", flexDirection: "column", borderTop: "1px solid #333" }}>
              {[
                ["01", "מעקב אחרי הזמנות", "סטטוס כל הזמנה, מהקבלה ועד המסירה."],
                ["02", "הזמנה חוזרת בלחיצה", "אותם פריטים, צבעים ומידות, ישר לסל."],
                ["03", "כתובות ופרטי עסק שמורים", "קופה מהירה יותר וחשבונית על שם העסק."],
              ].map(([n, t, d]) => (
                <div key={n} style={{ display: "flex", gap: 16, padding: "18px 0", borderBottom: "1px solid #333" }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: "#FFD100" }}>{n}</span>
                  <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontSize: 17, fontWeight: 800 }}>{t}</span>
                    <span style={{ fontSize: 14, color: "#b5b5b0", lineHeight: 1.5 }}>{d}</span>
                  </span>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </main>
    );
  }

  const nav = [
    ["orders", "ההזמנות שלי", "3"],
    ["addr", "כתובות למשלוח", ""],
    ["details", "פרטים אישיים", ""],
  ] as const;

  return (
    <main className="wrap" style={{ padding: "clamp(24px, 5vw, 72px) var(--gutter) clamp(56px, 7vw, 112px)" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "clamp(24px, 3.5vw, 44px)" }}>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-end", gap: 16, borderBottom: "2px solid #111", paddingBottom: "clamp(16px, 2.5vw, 28px)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span className="muted" style={{ fontSize: 14, fontWeight: 700 }}>האזור האישי</span>
            <h1 className="k sec-title">שלום, אבי</h1>
            <span className="muted" style={{ fontSize: 15 }}>
              כהן בנייה ותשתיות בע״מ · <span dir="ltr">{masked || pretty}</span>
            </span>
          </div>
          <button className="btn btn-line" style={{ height: 46, padding: "0 18px" }} onClick={logout}>התנתקות</button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "clamp(20px, 3vw, 48px)", alignItems: "flex-start" }}>
          <nav className="acct-nav desk">
            {nav.map(([id, label, count]) => (
              <button key={id} className={`acct-tab ${tab === id ? "on" : ""}`} onClick={() => setTab(id)}>
                <span>{label}</span>
                {count && <span style={{ background: "#FFD100", color: "#111", minWidth: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800 }}>{count}</span>}
              </button>
            ))}
          </nav>
          <nav className="mob-flex scroller" style={{ gap: 4, overflowX: "auto", width: "100%" }}>
            {nav.map(([id, label, count]) => (
              <button key={id} className={`acct-tab ${tab === id ? "on" : ""}`} onClick={() => setTab(id)}>
                <span>{label}</span>
                {count && <span style={{ background: "#FFD100", color: "#111", minWidth: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800 }}>{count}</span>}
              </button>
            ))}
          </nav>
          <div style={{ flex: "1 1 560px", minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
            {tab === "orders" && ORDERS.map((o) => {
              let tot = 0;
              let units = 0;
              const lines = o.lines.flatMap(([pid, ci, z, q]) => {
                const item = product(pid);
                if (!item) return [];
                const sz = item.sizes.includes(z) ? z : item.sizes[0];
                const pr = priceFor(item, q);
                tot += pr;
                units += q;
                return [{ pid, ci, sz, q, item, pr }];
              });
              const active = o.st < 3;
              const shown = open[o.no] ?? active;
              return (
                <article key={o.no} className="order" style={{ boxShadow: active ? "inset 0 0 0 2px #111" : "inset 0 0 0 1px #E4E4E1" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12 }}>
                    <span>
                      <b style={{ display: "block", fontSize: 18 }}>הזמנה #{o.no}</b>
                      <span className="muted" style={{ fontSize: 14 }}>{o.date} · {units} יחידות</span>
                    </span>
                    <span className="pill" style={{ background: active ? "#FFD100" : "#F4F4F2" }}>{active ? "בדרך אליכם" : "נמסרה"}</span>
                  </div>
                  {active && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <div className="track">
                        {STEPS.map((label, i) => (
                          <span key={label}>
                            <b className={i <= o.st ? "on" : ""} />
                            <span style={{ fontSize: 13, fontWeight: i === o.st ? 800 : 600, color: i <= o.st ? "#111" : "#8a8a86" }}>{label}</span>
                          </span>
                        ))}
                      </div>
                      <span style={{ fontSize: 15, fontWeight: 700 }}>{o.eta}</span>
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {lines.map((l) => (
                      <span key={l.pid + l.sz} style={{ position: "relative", width: 64, height: 64, background: "#F4F4F2", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {l.item.imgs?.[0] ? <img src={l.item.imgs[0]} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", mixBlendMode: "multiply" }} /> : <span className="k" style={{ color: "#8a8a86", fontSize: 22 }}>{phOf(l.item)}</span>}
                        <span style={{ position: "absolute", bottom: 0, left: 0, background: "#111", color: "#fff", fontSize: 11, fontWeight: 800, padding: "2px 5px" }}>×{l.q}</span>
                      </span>
                    ))}
                  </div>
                  {shown && (
                    <div style={{ borderTop: "1px solid #E4E4E1" }}>
                      {lines.map((l) => (
                        <div key={l.pid + l.sz + "l"} style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "12px 0", borderBottom: "1px solid #EFEFEC", fontSize: 15 }}>
                          <span>
                            <b style={{ display: "block" }}>{l.item.name}</b>
                            <span className="muted" style={{ fontSize: 13 }}>{[l.item.colors[l.ci], l.sz, l.q + " יח׳"].filter(Boolean).join(" · ")}</span>
                          </span>
                          <b>{fmt(l.pr)}</b>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12, borderTop: "1px solid #E4E4E1", paddingTop: 16 }}>
                    <span><span className="muted" style={{ fontSize: 14 }}>סה״כ </span><b style={{ fontSize: 22 }}>{fmt(tot)}</b></span>
                    <span style={{ display: "flex", alignItems: "center", gap: 16 }}>
                      <button onClick={() => setOpen((s) => ({ ...s, [o.no]: !shown }))} style={{ background: "none", border: 0, fontWeight: 700, textDecoration: "underline" }}>{shown ? "הסתרת פרטים" : "פרטי הזמנה"}</button>
                      <button className="btn" style={{ height: 46, padding: "0 18px" }} onClick={() => { addMany(lines.map((l) => [l.pid, l.ci, l.sz, l.q]), true); flash(`פריטי הזמנה #${o.no} נוספו לסל`); }}>הזמנה חוזרת</button>
                    </span>
                  </div>
                </article>
              );
            })}
            {tab === "addr" && (
              <div className="addr-grid">
                <div className="addr main">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <b style={{ fontSize: 17 }}>משרד ראשי</b>
                    <span className="save-tag y">ברירת מחדל</span>
                  </div>
                  <span style={{ fontSize: 15, lineHeight: 1.6, color: "#3a3a38" }}>אבי כהן<br />הפועלים 20<br />באר שבע</span>
                  <button style={{ background: "none", border: 0, fontWeight: 700, textDecoration: "underline", marginTop: "auto", alignSelf: "flex-start" }}>עריכה</button>
                </div>
                <div className="addr">
                  <b style={{ fontSize: 17 }}>אתר עבודה – נתיבות</b>
                  <span style={{ fontSize: 15, lineHeight: 1.6, color: "#3a3a38" }}>מנהל עבודה: יוסי<br />אזור התעשייה<br />נתיבות</span>
                  <div style={{ display: "flex", gap: 16, marginTop: "auto", flexWrap: "wrap" }}>
                    <button style={{ background: "none", border: 0, fontWeight: 700, textDecoration: "underline" }}>עריכה</button>
                    <button style={{ background: "none", border: 0, fontWeight: 700, textDecoration: "underline" }}>הגדרה כברירת מחדל</button>
                    <button style={{ background: "none", border: 0, fontWeight: 700, textDecoration: "underline" }}>הסרה</button>
                  </div>
                </div>
                <button className="dash-add">+ הוספת כתובת</button>
              </div>
            )}
            {tab === "details" && (
              <div style={{ background: "#F4F4F2", padding: "clamp(20px, 3.5vw, 40px)", display: "flex", flexDirection: "column", gap: 24 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", gap: 14 }}>
                  <label className="field">שם מלא<input defaultValue="אבי כהן" autoComplete="name" /></label>
                  <label className="field">אימייל<input defaultValue="avi@cohen-build.co.il" type="email" dir="ltr" style={{ textAlign: "right" }} /></label>
                  <label className="field">
                    <span style={{ display: "flex", justifyContent: "space-between" }}>טלפון נייד<span className="badge b" style={{ fontSize: 12 }}>מאומת</span></span>
                    <input value={pretty} readOnly dir="ltr" style={{ textAlign: "right", background: "#EAEAE6", color: "#5e5e5b" }} />
                  </label>
                  <label className="field">שם העסק לחשבונית<input defaultValue="כהן בנייה ותשתיות בע״מ" /></label>
                  <label className="field">ח.פ / ע.מ<input defaultValue="515000000" inputMode="numeric" dir="ltr" style={{ textAlign: "right" }} /></label>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 15, fontWeight: 600 }}>
                  <input type="checkbox" defaultChecked style={{ width: 20, height: 20, accentColor: "#111" }} />
                  עדכונים על מבצעי כמות ב-SMS
                </label>
                <button className="btn" style={{ alignSelf: "flex-start", height: 56, padding: "0 32px", fontSize: 16 }} onClick={() => flash("הפרטים נשמרו")}>שמירת פרטים</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

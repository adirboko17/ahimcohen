"use client";

import { useEffect, useRef, useState } from "react";
import { verifyAccountPreview } from "@/app/account/actions";
import { ORDERS } from "@/lib/catalog";
import { useStore } from "@/lib/store";
import { AccountOrders } from "./AccountOrders";
import { IconBack } from "./icons";

export function AccountView() {
  const { auth, phone, accountPreviewPhone, login, logout, flash } = useStore();
  const [stage, setStage] = useState<"phone" | "code">("phone");
  const [draft, setDraft] = useState(accountPreviewPhone ?? "");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [err, setErr] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [tab, setTab] = useState("orders");
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const verificationPending = useRef(false);

  useEffect(() => {
    if (stage === "code") refs.current[0]?.focus();
  }, [stage]);

  const digits = (auth ? phone : draft).replace(/\D/g, "");
  const masked = digits.length === 10 ? `${digits.slice(0, 3)}-•••-${digits.slice(6)}` : draft;
  const pretty = digits.length === 10 ? `${digits.slice(0, 3)}-${digits.slice(3)}` : draft;

  const startPreview = () => {
    if (!accountPreviewPhone) return;
    if (!/^05\d{8}$/.test(digits)) {
      setErr("הזינו מספר נייד תקין בן 10 ספרות");
      return;
    }
    if (digits !== accountPreviewPhone) {
      setErr("המספר הזה אינו מוגדר לחשבון הדמה.");
      return;
    }
    setErr("");
    setOtp(["", "", "", "", "", ""]);
    setStage("code");
  };

  const verify = async (code: string[]) => {
    if (verificationPending.current) return;
    const value = code.join("");
    if (!/^\d{6}$/.test(value)) {
      setErr("הזינו את כל 6 הספרות");
      return;
    }
    verificationPending.current = true;
    setVerifying(true);
    setErr("");
    try {
      if (!(await verifyAccountPreview(digits, value))) {
        setErr("קוד האימות שגוי. נסו שוב.");
        setOtp(["", "", "", "", "", ""]);
        refs.current[0]?.focus();
        return;
      }
      login(digits);
      setStage("phone");
      setOtp(["", "", "", "", "", ""]);
      setTab("orders");
      flash("התחברתם בהצלחה");
      window.scrollTo({ top: 0 });
    } catch {
      setErr("לא ניתן לאמת את הקוד כרגע. נסו שוב.");
    } finally {
      verificationPending.current = false;
      setVerifying(false);
    }
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
        <header className="account-intro">
          <h1 className="k">האזור האישי</h1>
        </header>
        <div className="account-grid">
          <div className="panel">
            {stage === "phone" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <h2 className="k account-form-title">כניסה עם קוד לנייד</h2>
                  <p className="muted" style={{ margin: 0, fontSize: 17, lineHeight: 1.55, maxWidth: "44ch" }}>
                    {accountPreviewPhone ? "כניסת דמה מקומית לצורך עיצוב האזור האישי." : "הכניסה לאזור האישי עדיין אינה זמינה."}
                  </p>
                </div>
                <label className="field">
                  מספר טלפון נייד
                  <input className="big" value={draft} disabled={!accountPreviewPhone} onChange={(e) => { setDraft(e.target.value.replace(/[^\d-]/g, "").slice(0, 11)); setErr(""); }} onKeyDown={(e) => { if (e.key === "Enter") startPreview(); }} type="tel" inputMode="numeric" autoComplete="tel" placeholder="050-0000000" dir="ltr" style={{ textAlign: "right", boxShadow: err ? "inset 0 0 0 2px #B3261E" : undefined }} />
                </label>
                {err && <span className="err" role="alert" style={{ marginTop: -16 }}>{err}</span>}
                <button className="btn" style={{ height: 60, fontSize: 17 }} disabled={!accountPreviewPhone} onClick={startPreview}>המשך להזנת קוד</button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
                <button disabled={verifying} onClick={() => { setStage("phone"); setErr(""); }} style={{ background: "none", border: 0, fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, alignSelf: "flex-start" }}>
                  <IconBack /> שינוי מספר
                </button>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <h2 className="k account-form-title">הזנת קוד אימות</h2>
                  <p className="muted" style={{ margin: 0, fontSize: 17, lineHeight: 1.55 }}>
                    הזינו את קוד הדמה בן 6 הספרות עבור <span dir="ltr" style={{ fontWeight: 800, color: "#111" }}>{masked}</span>
                  </p>
                </div>
                <div className="otp">
                  {otp.map((v, i) => (
                    <input key={i} ref={(el) => { refs.current[i] = el; }} className={err ? "bad" : v ? "fill" : ""} value={v} readOnly={verifying} inputMode="numeric" autoComplete="one-time-code" aria-label={`ספרה ${i + 1}`} onFocus={(e) => e.target.select()} onChange={(e) => setDigit(i, e.target.value)} onKeyDown={(e) => {
                      if (verifying) return;
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
                {err && <span className="err" role="alert" style={{ marginTop: -16 }}>{err}</span>}
                <button className="btn" disabled={verifying} style={{ height: 60, fontSize: 17, maxWidth: 440 }} onClick={() => verify(otp)}>{verifying ? "מאמתים…" : "אימות וכניסה"}</button>
              </div>
            )}
          </div>
          <aside className="panel dark">
            <span className="k" style={{ fontSize: "clamp(44px, 4.5vw, 64px)", lineHeight: 0.85, color: "#FFD100" }}>באזור האישי</span>
            <div style={{ display: "flex", flexDirection: "column", borderTop: "1px solid #333" }}>
              {[
                ["01", "היסטוריית הזמנות", "הפריטים והסכומים של כל הזמנה."],
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
    ["orders", "ההזמנות שלי", String(ORDERS.length)],
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
            {tab === "orders" && <AccountOrders />}
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

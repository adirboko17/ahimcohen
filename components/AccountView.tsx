"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useStore } from "@/lib/store";
import styles from "./AccountView.module.css";

type Operation = "send" | "verify" | "logout";

export function AccountView() {
  const { account, flash } = useStore();
  const [draft, setDraft] = useState("");
  const [recipient, setRecipient] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<Operation | null>(null);
  const pending = useRef(false);
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(0);
  const remaining = Math.max(0, Math.ceil((retryAt - now) / 1000));
  const codeInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (recipient) codeInput.current?.focus();
  }, [recipient]);

  useEffect(() => {
    if (!remaining) return;
    const timer = window.setTimeout(() => setNow(Date.now()), 1000);
    return () => window.clearTimeout(timer);
  }, [remaining, now]);

  async function run(operation: Operation) {
    const auth = account.client;
    if (!auth || pending.current) return;
    pending.current = true;
    setBusy(operation);
    setError("");
    try {
      if (operation === "send") {
        const email = recipient || draft.trim();
        const { error } = await auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
        if (error) throw error;
        setRecipient(email);
        setCode("");
        const time = Date.now();
        setRetryAt(time + 60_000);
        setNow(time);
        if (recipient) flash("קוד חדש נשלח למייל");
      } else if (operation === "verify") {
        const { error } = await auth.verifyOtp({ email: recipient, token: code.trim(), type: "email" });
        if (error) throw error;
        setRecipient("");
        setCode("");
        setDraft("");
        flash("התחברתם בהצלחה");
      } else {
        const { error } = await auth.signOut({ scope: "local" });
        if (error) throw error;
        flash("התנתקתם מהחשבון");
      }
    } catch (cause) {
      if (cause && typeof cause === "object" && "status" in cause && cause.status === 429)
        setError("בוצעו כמה ניסיונות ברצף. המתינו מעט ונסו שוב.");
      else if (operation === "verify" && cause && typeof cause === "object" && "code" in cause && cause.code === "otp_expired")
        setError("הקוד שגוי או שפג תוקפו. בדקו את הקוד האחרון שקיבלתם או בקשו קוד חדש.");
      else setError(operation === "send" ? "שליחת הקוד נכשלה. בדקו את כתובת המייל ונסו שוב." :
        operation === "verify" ? "אימות הקוד נכשל. נסו שוב." : "ההתנתקות נכשלה. נסו שוב.");
    } finally {
      pending.current = false;
      setBusy(null);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void run(recipient ? "verify" : "send");
  }

  return <main className={`wrap ${styles.main}`}>
    <header className="account-intro"><h1 className="k">האזור האישי</h1></header>
    <section className={`panel ${styles.card}`}>
      {account.loading ? <p role="status">טוענים את החשבון…</p> :
        account.email ? <>
          <h2 className="k account-form-title">החשבון שלי</h2>
          <p>מחוברים עם כתובת המייל <bdi>{account.email}</bdi></p>
          <button type="button" className="btn btn-line" disabled={!!busy} onClick={() => void run("logout")}>
            {busy === "logout" ? "מתנתקים…" : "התנתקות"}
          </button>
        </> : !account.client ? <p role="status">הכניסה לחשבון אינה זמינה כרגע. נסו שוב בהמשך.</p> :
        <form onSubmit={submit} className={styles.form}>
          <h2 className="k account-form-title">{recipient ? "הזנת קוד אימות" : "כניסה והרשמה"}</h2>
          <p className="muted" aria-live="polite">{recipient
            ? <>שלחנו קוד חד־פעמי לכתובת <bdi>{recipient}</bdi>.</>
            : "נשלח לכם קוד חד־פעמי למייל. בכניסה הראשונה ייפתח עבורכם חשבון."}</p>
          {recipient ? <label className="field">הקוד שקיבלתם במייל
            <input ref={codeInput} dir="ltr" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6,10}"
              minLength={6} maxLength={10} required value={code} readOnly={!!busy}
              onChange={e => { setCode(e.target.value.replace(/\D/g, "")); setError(""); }} />
          </label> : <label className="field">כתובת מייל
            <input dir="ltr" type="email" name="email" autoComplete="email" placeholder="name@example.com"
              required maxLength={254} value={draft} readOnly={!!busy} onChange={e => { setDraft(e.target.value); setError(""); }} />
          </label>}
          <button className="btn" disabled={!!busy} type="submit">{recipient
            ? busy === "verify" ? "מאמתים…" : "אימות וכניסה"
            : busy === "send" ? "שולחים…" : "שליחת קוד למייל"}</button>
          {recipient && <div className={styles.links}>
            <button type="button" disabled={!!busy || remaining > 0} onClick={() => void run("send")}>
              {remaining ? `שליחה חוזרת בעוד ${remaining} שניות` : "שליחת קוד חדש"}
            </button>
            <button type="button" disabled={!!busy} onClick={() => { setRecipient(""); setCode(""); setError(""); }}>שינוי כתובת מייל</button>
          </div>}
        </form>}
      {error && <p className="err" role="alert">{error}</p>}
    </section>
  </main>;
}

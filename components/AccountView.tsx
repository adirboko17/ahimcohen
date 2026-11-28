"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { IconCheck, IconLock, IconUser } from "./icons";
import styles from "./AccountView.module.css";

type Operation = "send" | "verify";
const codeLength = 6;
const emptyDigits = () => Array<string>(codeLength).fill("");

export function AccountView() {
  const { account, flash } = useStore();
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [recipient, setRecipient] = useState("");
  const [digits, setDigits] = useState(emptyDigits);
  const code = digits.join("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<Operation | null>(null);
  const pending = useRef(false);
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(0);
  const remaining = Math.max(0, Math.ceil((retryAt - now) / 1000));
  const codeInputs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (account.email) router.replace("/account");
  }, [account.email, router]);

  useEffect(() => {
    if (recipient) codeInputs.current[0]?.focus();
  }, [recipient, retryAt]);

  function enterDigits(index: number, raw: string) {
    const entered = raw.replace(/\s/g, "");
    if (!/^\d*$/.test(entered)) return;
    if (entered.length > codeLength) {
      setError("הקוד צריך להכיל 6 ספרות. השתמשו בקוד האחרון שנשלח אליכם.");
      return;
    }
    const start = entered.length === codeLength ? 0 : index;
    const next = digits.slice();
    if (entered) {
      for (let offset = 0; offset < entered.length && start + offset < codeLength; offset++) {
        next[start + offset] = entered[offset];
      }
    } else {
      next[start] = "";
    }
    setDigits(next);
    setError("");
    if (entered) {
      const target = codeInputs.current[Math.min(start + entered.length, codeLength - 1)];
      target?.focus();
      target?.select();
    }
  }

  useEffect(() => {
    if (!remaining) return;
    const timer = window.setTimeout(() => setNow(Date.now()), 1000);
    return () => window.clearTimeout(timer);
  }, [remaining, now]);

  async function run(operation: Operation) {
    const auth = account.client;
    if (!auth || pending.current) return;
    if (operation === "verify" && !/^\d{6}$/.test(code)) return;
    pending.current = true;
    setBusy(operation);
    setError("");
    try {
      if (operation === "send") {
        const email = recipient || draft.trim();
        const { error } = await auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
        if (error) throw error;
        setRecipient(email);
        setDigits(emptyDigits());
        const time = Date.now();
        setRetryAt(time + 60_000);
        setNow(time);
        if (recipient) flash("קוד חדש נשלח למייל");
      } else {
        const { error } = await auth.verifyOtp({ email: recipient, token: code.trim(), type: "email" });
        if (error) throw error;
        setRecipient("");
        setDigits(emptyDigits());
        setDraft("");
        flash("התחברתם בהצלחה");
      }
    } catch (cause) {
      if (cause && typeof cause === "object" && "status" in cause && cause.status === 429)
        setError("בוצעו כמה ניסיונות ברצף. המתינו מעט ונסו שוב.");
      else if (operation === "verify" && cause && typeof cause === "object" && "code" in cause && cause.code === "otp_expired")
        setError("הקוד שגוי או שפג תוקפו. בדקו את הקוד האחרון שקיבלתם או בקשו קוד חדש.");
      else setError(operation === "send" ? "שליחת הקוד נכשלה. בדקו את כתובת המייל ונסו שוב." : "אימות הקוד נכשל. נסו שוב.");
    } finally {
      pending.current = false;
      setBusy(null);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void run(recipient ? "verify" : "send");
  }

  return <main className={styles.main}>
    <section className={styles.card}>
      <div className={styles.authHeader}>
        <span className={styles.symbol}>{recipient ? <IconLock size={24} /> : <IconUser size={24} />}</span>
        <h1 className="k">{recipient ? "אימות כתובת המייל" : "כניסה לאזור האישי"}</h1>
      </div>
      {account.loading || account.email ? <p role="status">פותחים את האזור האישי…</p> :
        !account.client ? <p role="status">הכניסה לחשבון אינה זמינה כרגע. נסו שוב בהמשך.</p> :
        <form onSubmit={submit} className={styles.form}>
          {!recipient && <p className="policy-note">פתיחת חשבון היא לבחירתכם. כתובת המייל משמשת את האחים כהן ואת שירות האימות לשליחת קוד ולזיהוי ההזמנות שלכם. <a href="/info/privacy">מדיניות פרטיות וזכויות עיון ותיקון</a></p>}
          <ol className={styles.steps} aria-label="שלבי הכניסה">
            <li aria-current={!recipient ? "step" : undefined}><span>{recipient ? <IconCheck size={14} /> : "1"}</span>כתובת מייל</li>
            <li aria-current={recipient ? "step" : undefined}><span>2</span>אימות קוד</li>
          </ol>
          <p className={styles.hint} aria-live="polite">{recipient
            ? <>שלחנו קוד חד־פעמי לכתובת <bdi>{recipient}</bdi>.</>
            : "נשלח לכם קוד חד־פעמי למייל. בכניסה הראשונה ייפתח עבורכם חשבון."}</p>
          {recipient ? <fieldset className={styles.codeField}>
            <legend>קוד האימות בן 6 הספרות</legend>
            <div className={styles.digits} dir="ltr">
              {digits.map((digit, i) => <input key={i} ref={el => { codeInputs.current[i] = el; }}
                type="text" inputMode="numeric" autoComplete={i === 0 ? "one-time-code" : "off"}
                aria-label={`ספרה ${i + 1} מתוך 6`} required pattern="[0-9]" value={digit} readOnly={!!busy}
                onFocus={e => e.currentTarget.select()} onClick={e => e.currentTarget.select()}
                onChange={e => enterDigits(i, e.target.value)}
                onPaste={e => { e.preventDefault(); if (!busy) enterDigits(i, e.clipboardData.getData("text")); }}
                onKeyDown={e => {
                  if (busy) return;
                  if (e.key === "Backspace" && !digit && i > 0) {
                    e.preventDefault();
                    enterDigits(i - 1, "");
                    codeInputs.current[i - 1]?.focus();
                  } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                    e.preventDefault();
                    codeInputs.current[i + (e.key === "ArrowLeft" ? -1 : 1)]?.focus();
                  }
                }} />)}
            </div>
          </fieldset> : <label className="field">כתובת מייל
            <input dir="ltr" type="email" name="email" autoComplete="email" placeholder="name@example.com"
              required maxLength={254} value={draft} readOnly={!!busy} onChange={e => { setDraft(e.target.value); setError(""); }} />
          </label>}
          <button className={`btn btn-yellow btn-lg ${styles.submit}`} disabled={!!busy || (!!recipient && code.length !== codeLength)} type="submit">
            {recipient && <IconLock size={18} />}{recipient
            ? busy === "verify" ? "מאמתים…" : "אימות וכניסה"
            : busy === "send" ? "שולחים…" : "שליחת קוד למייל"}</button>
          {recipient && <div className={styles.links}>
            <button type="button" disabled={!!busy || remaining > 0} onClick={() => void run("send")}>
              {remaining ? `שליחה חוזרת בעוד ${remaining} שניות` : "שליחת קוד חדש"}
            </button>
            <button type="button" disabled={!!busy} onClick={() => { setRecipient(""); setDigits(emptyDigits()); setError(""); }}>שינוי כתובת מייל</button>
          </div>}
        </form>}
      {error && <p className="err" role="alert">{error}</p>}
    </section>
  </main>;
}

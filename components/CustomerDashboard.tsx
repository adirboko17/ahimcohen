"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useStore } from "@/lib/store";
import { IconCheck, IconFwd, IconUser } from "./icons";
import styles from "./AccountView.module.css";
import { CustomerOrderHistory } from "./CustomerOrderHistory";

export function CustomerDashboard() {
  const { account } = useStore();
  const router = useRouter();
  useEffect(() => {
    if (!account.loading && !account.email) router.replace("/account/login");
  }, [account.loading, account.email, router]);

  if (!account.email) return <main className={styles.main}><p role="status">טוענים את החשבון…</p></main>;
  return <DashboardContent key={account.email} />;
}

function DashboardContent() {
  const { account, flash } = useStore();
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [busy, setBusy] = useState<"save" | "logout" | null>(null);
  const [error, setError] = useState("");

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (!account.client || busy) return;
    setBusy("save");
    setError("");
    try {
      const { error } = await account.client.updateUser({ data: { full_name: draftName.trim() } });
      if (error) throw error;
      setEditing(false);
      flash("השם נשמר בחשבון");
    } catch {
      setError("שמירת השם נכשלה. אפשר לנסות שוב.");
    } finally {
      setBusy(null);
    }
  }

  async function logout() {
    if (!account.client || busy) return;
    setBusy("logout");
    setError("");
    try {
      const { error } = await account.client.signOut({ scope: "local" });
      if (error) throw error;
      flash("התנתקתם מהחשבון");
    } catch {
      setError("ההתנתקות נכשלה. אפשר לנסות שוב.");
    } finally {
      setBusy(null);
    }
  }

  return <main className={styles.dashboard}>
    <header className={styles.hero}>
      <div><h1 className="k">האזור האישי</h1>
        <p>{account.name ? `שלום, ${account.name}` : "ברוכים הבאים לחשבון שלכם"}</p></div>
      <div className={styles.heroImage} aria-hidden="true" />
    </header>
    <div className={styles.dashboardGrid}>
      <section className={styles.tile}>
        <h2><IconUser size={22} /> הפרטים שלי</h2>
        <dl className={styles.details}>
          <div><dt>כתובת מייל</dt><dd><bdi>{account.email}</bdi><IconCheck size={16} /><span className={styles.verified}>מאומתת</span></dd></div>
          {!editing && <div><dt>שם מלא</dt><dd>{account.name || "טרם הוזן"}</dd></div>}
        </dl>
        {editing ? <form onSubmit={saveProfile} className={styles.edit}>
          <label className="field">שם מלא<input autoFocus autoComplete="name" maxLength={100} value={draftName}
            onChange={e => setDraftName(e.target.value)} readOnly={!!busy} /></label>
          <div><button type="submit" className="btn btn-yellow" disabled={!!busy}>{busy === "save" ? "שומרים…" : "שמירה"}</button>
            <button type="button" className={styles.textButton} disabled={!!busy} onClick={() => { setError(""); setEditing(false); }}>ביטול</button></div>
        </form> : <button type="button" className={styles.action} disabled={!!busy} onClick={() => {
          setDraftName(account.name); setError(""); setEditing(true);
        }}>{account.name ? "עריכת השם" : "הוספת שם לחשבון"}<IconFwd /></button>}
      </section>
      <CustomerOrderHistory />
    </div>
    {error && <p className="err" role="alert">{error}</p>}
    <footer className={styles.accountFooter}><nav aria-label="שירות לקוחות">
      <Link href="/info/shipping">משלוחים והחזרות</Link><Link href="/info/contact">יצירת קשר</Link>
    </nav><button type="button" className={styles.textButton} disabled={!!busy} onClick={logout}>
      {busy === "logout" ? "מתנתקים…" : "התנתקות"}
    </button></footer>
  </main>;
}

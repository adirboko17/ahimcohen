"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useCatalog } from "@/lib/catalog-context";
import { useStore } from "@/lib/store";

export function Footer() {
  const { flash } = useStore();
  const { categories } = useCatalog();
  const [email, setEmail] = useState("");
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!email.includes("@")) {
      flash("הזינו כתובת אימייל");
      return;
    }
    setEmail("");
    flash("נרשמתם. 5% הנחה בדרך למייל");
  };
  return (
    <footer className="site-footer">
      <div className="foot-in">
        <div className="foot-hero">
          <span className="k foot-title">
            5% הנחה
            <br />
            על הקנייה הראשונה.
          </span>
          <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span style={{ fontSize: 15, color: "#bdbdb7" }}>הרשמו למבצעים והטבות במייל.</span>
            <div className="mail">
              <input type="email" placeholder="כתובת אימייל" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="כתובת אימייל" />
              <button className="btn btn-yellow" style={{ height: 56, padding: "0 26px", fontSize: 16 }} type="submit">
                הרשמה
              </button>
            </div>
          </form>
        </div>
        <div className="foot-cols">
          <div className="col">
            <img src="/logo.avif" alt="Cohen Brothers" className="logo-inv" />
            <span style={{ fontSize: 15, lineHeight: 1.8, color: "#bdbdb7" }}>
              הפועלים 20, באר שבע
              <br />
              <a href="tel:08-6233803" style={{ color: "#fff", direction: "ltr", display: "inline-block" }}>
                08-6233803
              </a>
              <br />
              <a href="mailto:Hazmanot@ahim-cohen.co.il" style={{ color: "#fff" }}>
                Hazmanot@ahim-cohen.co.il
              </a>
            </span>
          </div>
          <div className="col">
            <span style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>קטגוריות</span>
            <Link href="/brands">מותגים</Link>
            {categories.slice(0, 6).map((c) => (
              <Link key={c.id} href={`/c/${c.id}`}>
                {c.name}
              </Link>
            ))}
          </div>
          <div className="col">
            <span style={{ fontWeight: 800, marginBottom: 4 }}>שירות</span>
            <Link href="/business">הזמנות לעסקים</Link>
            <Link href="/info/shipping">משלוחים והחזרות</Link>
            <Link href="/info/faq">שאלות נפוצות</Link>
            <Link href="/info/contact">צור קשר</Link>
            <Link href="/account">החשבון שלי</Link>
          </div>
          <div className="col">
            <span style={{ fontWeight: 800, marginBottom: 4 }}>מידע</span>
            <Link href="/info/terms">תקנון האתר</Link>
            <Link href="/info/privacy">מדיניות פרטיות</Link>
            <Link href="/info/accessibility">הצהרת נגישות</Link>
            <a href="https://www.instagram.com/ahim.cohen" target="_blank" rel="noreferrer">
              אינסטגרם
            </a>
            <a href="https://www.facebook.com/ahimcohen100/" target="_blank" rel="noreferrer">
              פייסבוק
            </a>
          </div>
        </div>
        <div className="foot-bottom">
          <span>© האחים כהן · כל הזכויות שמורות</span>
          <span style={{ letterSpacing: ".2em", fontWeight: 700 }}>QUALITY AT WORK</span>
        </div>
      </div>
    </footer>
  );
}

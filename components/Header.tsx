"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ANNOUNCEMENTS, FREE_SHIPPING } from "@/lib/catalog";
import { useCatalog } from "@/lib/catalog-context";
import { fmt } from "@/lib/pricing";
import { useStore } from "@/lib/store";
import { IconBag, IconLock, IconMenu, IconSearch, IconUser } from "./icons";

export function Announcement() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % ANNOUNCEMENTS.length), 4500);
    return () => clearInterval(t);
  }, []);
  const text = ANNOUNCEMENTS[i].replace("{thr}", fmt(FREE_SHIPPING));
  return (
    <div className="announcement" aria-live="polite">
      {text}
    </div>
  );
}

export function Header() {
  const path = usePathname();
  const { categories, category } = useCatalog();
  const { cart, openCart, openSearch, openMenu, auth } = useStore();
  const count = cart.reduce((a, l) => a + l.qty, 0);
  const [mega, setMega] = useState<string | null>(null);
  const [compact, setCompact] = useState(false);
  const [navHidden, setNavHidden] = useState(false);
  const st = useRef({ compact: false, navHidden: false, y: 0 });
  const catId = path.startsWith("/c/") ? path.split("/")[2] : "";

  useEffect(() => {
    st.current.y = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const d = y - st.current.y;
      if (y < 120) {
        if (st.current.compact || st.current.navHidden) {
          st.current.compact = false;
          st.current.navHidden = false;
          setCompact(false);
          setNavHidden(false);
        }
        st.current.y = y;
        return;
      }
      if (Math.abs(d) < 6) return;
      if (d > 0 && !st.current.navHidden) {
        st.current.compact = true;
        st.current.navHidden = true;
        setCompact(true);
        setNavHidden(true);
        setMega(null);
      } else if (d < 0 && st.current.navHidden) {
        st.current.compact = true;
        st.current.navHidden = false;
        setCompact(true);
        setNavHidden(false);
      } else if (!st.current.compact) {
        st.current.compact = true;
        setCompact(true);
      }
      st.current.y = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const mc = mega ? category(mega) : undefined;

  return (
    <>
      <header className={`desktop-header desk ${compact ? "compact" : ""} ${navHidden ? "nav-hidden" : ""}`} onMouseLeave={() => setMega(null)}>
        <div className="header-bar">
          <div className="header-side">
            <button className="icon-btn" onClick={openSearch} aria-label="חיפוש">
              <IconSearch />
              חיפוש
            </button>
            <Link href="/business" className="icon-btn">
              <span className="dot" />
              הזמנות לעסקים
            </Link>
          </div>
          <Link href="/" className="logo-btn" aria-label="האחים כהן – דף הבית">
            <img src="/logo.avif" alt="Cohen Brothers – Quality at Work" className="logo" />
          </Link>
          <div className="header-side end">
            <Link href="/account" className="icon-btn">
              <IconUser />
              {auth ? "אזור אישי" : "חשבון"}
            </Link>
            <button className="cart-btn" onClick={openCart}>
              <IconBag />
              סל
              <span className="cart-count">{count}</span>
            </button>
          </div>
        </div>
        <div className="nav-wrap">
          <div className="nav-clip">
            <nav className="main-nav scroller">
              {categories.map((c) => (
                <Link
                  key={c.id}
                  href={`/c/${c.id}`}
                  className={`nav-link ${mega === c.id || catId === c.id ? "on" : ""}`}
                  onMouseEnter={() => setMega(c.id)}
                >
                  {c.name}
                </Link>
              ))}
              <Link href="/quantity-offers" className={`nav-link ${path === "/quantity-offers" ? "on" : ""}`} aria-current={path === "/quantity-offers" ? "page" : undefined} onMouseEnter={() => setMega(null)} onClick={() => setMega(null)}>
                <span className="deal-pill">מבצעי כמות</span>
              </Link>
            </nav>
          </div>
        </div>
        {mc && (
          <div className="mega">
            <div className="mega-in">
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <span className="k mega-title">{mc.name}</span>
                <div className="mega-grid">
                  {mc.subs.map((name) => (
                    <Link key={name} href={`/c/${mc.id}?sub=${encodeURIComponent(name)}`} className="mega-sub" onClick={() => setMega(null)}>
                      {name}
                      <span className="faint">←</span>
                    </Link>
                  ))}
                </div>
              </div>
              <Link href={`/c/${mc.id}`} className="mega-cta" onClick={() => setMega(null)}>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#bdbdb7" }}>{mc.subs.length} תתי קטגוריות</span>
                <span className="mega-go">
                  לכל המוצרים בקטגוריה
                  <span className="mega-arrow">←</span>
                </span>
              </Link>
            </div>
          </div>
        )}
      </header>
      <header className="mobile-header mob-block">
        <div className="mobile-bar">
          <div style={{ display: "flex" }}>
            <button className="m-ico" onClick={openMenu} aria-label="תפריט">
              <IconMenu />
            </button>
          </div>
          <Link href="/" aria-label="דף הבית" style={{ display: "flex", justifyContent: "center" }}>
            <img src="/logo.avif" alt="Cohen Brothers" style={{ height: 24, display: "block" }} />
          </Link>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <Link href="/account" className="m-ico" aria-label="חשבון">
              <IconUser size={22} />
            </Link>
            <button className="m-ico" onClick={openSearch} aria-label="חיפוש">
              <IconSearch size={22} />
            </button>
            <button className="m-ico" onClick={openCart} aria-label="סל">
              <IconBag size={22} />
              {count > 0 && <span className="m-count">{count}</span>}
            </button>
          </div>
        </div>
      </header>
    </>
  );
}

export function CheckoutHeader() {
  return (
    <header className="checkout-head">
      <div className="checkout-bar">
        <Link href="/">
          <img src="/logo.avif" alt="Cohen Brothers" style={{ height: 26, display: "block" }} />
        </Link>
        <div className="lock-note">
          <IconLock size={16} />
          תשלום מאובטח
        </div>
      </div>
    </header>
  );
}

export function TabBar() {
  const path = usePathname();
  const { openMenu, openSearch, openCart, cart } = useStore();
  const count = cart.reduce((a, l) => a + l.qty, 0);
  const home = path === "/";
  const cat = path.startsWith("/c/");
  const b2b = path.startsWith("/business");
  return (
    <nav className="tabbar show" aria-label="ניווט">
      <Link href="/" className={home ? "on" : ""} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, height: 62, fontSize: 11, fontWeight: home ? 800 : 500, color: home ? "#111" : "#5e5e5b", boxShadow: home ? "inset 0 3px 0 #FFD100" : "inset 0 3px 0 transparent" }}>
        <HomeGlyph />
        בית
      </Link>
      <button className={cat ? "on" : ""} onClick={openMenu}>
        <GridGlyph />
        קטגוריות
      </button>
      <button onClick={openSearch}>
        <IconSearch size={22} />
        חיפוש
      </button>
      <Link href="/business" className={b2b ? "on" : ""} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, height: 62, fontSize: 11, fontWeight: b2b ? 800 : 500, color: b2b ? "#111" : "#5e5e5b", boxShadow: b2b ? "inset 0 3px 0 #FFD100" : "inset 0 3px 0 transparent" }}>
        <CaseGlyph />
        לעסקים
      </Link>
      <button onClick={openCart}>
        <IconBag size={22} />
        סל
        {count > 0 && <span className="tab-count">{count}</span>}
      </button>
    </nav>
  );
}

function HomeGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 11 12 4l8 7v9h-5v-6H9v6H4z" />
    </svg>
  );
}
function GridGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="4" width="7" height="7" />
      <rect x="13" y="4" width="7" height="7" />
      <rect x="4" y="13" width="7" height="7" />
      <rect x="13" y="13" width="7" height="7" />
    </svg>
  );
}
function CaseGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="8" width="18" height="12" />
      <path d="M9 8V5h6v3M3 13h18" />
    </svg>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import { beginShopifyCheckout } from "@/app/actions/shopify-checkout";
import { FREE_SHIPPING, phOf } from "@/lib/catalog";
import { useCatalog } from "@/lib/catalog-context";
import { cartMath, fmt } from "@/lib/pricing";
import { useStore } from "@/lib/store";

export function CheckoutView() {
  const { cart } = useStore();
  const { product, categories } = useCatalog();
  const math = cartMath(cart);
  const [step, setStep] = useState(1);
  const [ship, setShip] = useState<"home" | "pickup">("home");
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState("");
  const free = math.total >= FREE_SHIPPING || ship === "pickup";
  const steps = ["פרטים", "משלוח", "תשלום"];

  async function pay() {
    setPaying(true);
    setPayError("");
    try {
      const result = await beginShopifyCheckout(cart.map((line) => ({
        pid: line.pid,
        color: line.color,
        size: line.size,
        qty: line.qty,
        variantId: line.variantId,
      })));
      if (result.ok) {
        window.location.assign(result.checkoutUrl);
        return;
      }
      setPayError(result.error);
    } catch {
      setPayError("לא הצלחנו לפתוח את הקופה של Shopify.");
    }
    setPaying(false);
  }

  if (cart.length === 0) {
    return (
      <main className="wrap-s" style={{ padding: "64px 0" }}>
        <h1 className="k page-title">הסל ריק</h1>
        <p className="muted" style={{ fontSize: 17, margin: "16px 0 24px" }}>אין מה לשלם עליו עדיין.</p>
        <Link href={categories[0] ? `/c/${categories[0].id}` : "/"} className="btn" style={{ height: 56, padding: "0 24px" }}>להתחיל לקנות</Link>
      </main>
    );
  }

  return (
    <main className="wrap-s" style={{ padding: "clamp(20px, 4vw, 48px) clamp(16px, 4vw, 40px) 64px" }}>
      <div className="checkout-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="step-bars">
            {steps.map((label, i) => (
              <div key={label}>
                <i className={i < step ? "on" : ""} />
                <span style={{ fontSize: 14, fontWeight: 700, color: i < step ? "#111" : "#8a8a86" }}>{label}</span>
              </div>
            ))}
          </div>
          {step === 1 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <span style={{ fontSize: 22, fontWeight: 800 }}>פרטים וכתובת</span>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: 10 }}>
                <label className="field">שם מלא<input autoComplete="name" /></label>
                <label className="field">טלפון נייד<input type="tel" autoComplete="tel" dir="ltr" style={{ textAlign: "right" }} /></label>
              </div>
              <label className="field">אימייל<input type="email" autoComplete="email" dir="ltr" style={{ textAlign: "right" }} /></label>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 200px), 1fr))", gap: 10 }}>
                <label className="field">עיר<input autoComplete="address-level2" /></label>
                <label className="field">רחוב ומספר<input autoComplete="street-address" /></label>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15, fontWeight: 600 }}>
                <input type="checkbox" style={{ width: 20, height: 20, accentColor: "#111" }} />
                הזמנה עבור עסק — שם עסק וח.פ. לחשבונית
              </label>
              <button className="btn" style={{ height: 58, fontSize: 16, marginTop: 6 }} onClick={() => { setStep(2); setPayError(""); }}>המשך לבחירת משלוח</button>
            </div>
          )}
          {step === 2 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>אופן קבלת ההזמנה</span>
              {[
                { id: "home" as const, t: "משלוח עד הבית", d: math.total >= FREE_SHIPPING ? "ההזמנה זכאית למשלוח חינם" : `חינם בהזמנות מעל ${fmt(FREE_SHIPPING)}`, p: math.total >= FREE_SHIPPING ? "חינם" : "לפי תעריף" },
                { id: "pickup" as const, t: "איסוף מהסניף", d: "הפועלים 20, באר שבע", p: "חינם" },
              ].map((o) => (
                <button key={o.id} className={`pack ${ship === o.id ? "on" : ""}`} onClick={() => setShip(o.id)}>
                  <span className="radio"><i /></span>
                  <span>
                    <b style={{ display: "block", fontSize: 16 }}>{o.t}</b>
                    <span className="muted" style={{ fontSize: 14 }}>{o.d}</span>
                  </span>
                  <b>{o.p}</b>
                </button>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button className="btn btn-line" style={{ height: 58, padding: "0 24px" }} onClick={() => { setStep(1); setPayError(""); }}>חזרה</button>
                <button className="btn" style={{ flex: 1, height: 58, fontSize: 16 }} onClick={() => setStep(3)}>המשך לתשלום</button>
              </div>
            </div>
          )}
          {step === 3 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <span style={{ fontSize: 22, fontWeight: 800 }}>תשלום</span>
              <p style={{ margin: 0, fontSize: 16, lineHeight: 1.6 }}>
                התשלום ממשיך בקופה המאובטחת של Shopify. פרטי הכרטיס לא נשמרים באתר הזה.
              </p>
              {payError && <div className="demo">{payError}</div>}
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <button className="btn btn-line" style={{ height: 58, padding: "0 24px" }} onClick={() => { setStep(2); setPayError(""); }} disabled={paying}>חזרה</button>
                <button className="btn" style={{ flex: 1, height: 58, fontSize: 16 }} disabled={paying} onClick={() => void pay()}>
                  {paying ? "פותחים קופה..." : `המשך לתשלום ${fmt(math.total)}`}
                </button>
              </div>
            </div>
          )}
        </div>
        <aside className="aside-box">
          <span style={{ fontSize: 17, fontWeight: 800 }}>סיכום הזמנה · {math.count === 1 ? "פריט אחד" : `${math.count} פריטים`}</span>
          {cart.map((l) => {
            const p = product(l.pid);
            if (!p) return null;
            return (
              <div key={l.key} style={{ display: "grid", gridTemplateColumns: "58px 1fr auto", gap: 12, alignItems: "center" }}>
                <div style={{ position: "relative", width: 58, height: 64, background: "#E9E9E6", overflow: "hidden" }}>
                  {p.imgs?.[0] ? <img src={p.imgs[0]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", mixBlendMode: "multiply" }} /> : <span className="k" style={{ fontSize: 18, color: "#bdbdb7" }}>{phOf(p)}</span>}
                  <span style={{ position: "absolute", top: 0, left: 0, minWidth: 20, height: 20, background: "#111", color: "#fff", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{l.qty}</span>
                </div>
                <div>
                  <b style={{ display: "block", fontSize: 14 }}>{p.name}</b>
                  <span className="muted" style={{ fontSize: 13 }}>{[l.color, l.size].filter(Boolean).join(" · ")}</span>
                </div>
                <b>{fmt(l.qty * (l.unitPrice ?? p.price))}</b>
              </div>
            );
          })}
          <div style={{ borderTop: "1px solid #D6D6D1", paddingTop: 14, display: "flex", flexDirection: "column", gap: 8, fontSize: 15 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span>סכום ביניים</span><span>{fmt(math.regular)}</span></div>
            {math.savings > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800 }}>
                <span style={{ background: "#FFD100", padding: "0 6px" }}>מבצעי כמות</span>
                <span dir="ltr">-{fmt(math.savings)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between" }}><span>משלוח</span><span>{free ? "חינם" : "לפי תעריף"}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 20, fontWeight: 800, borderTop: "2px solid #111", paddingTop: 12, marginTop: 4 }}>
              <span>סה״כ</span><span>{fmt(math.total)}</span>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

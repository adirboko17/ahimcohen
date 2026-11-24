"use client";

import Link from "next/link";
import { useState } from "react";
import { useCatalog } from "@/lib/catalog-context";
import { fmt } from "@/lib/pricing";
import { useStore } from "@/lib/store";
import { CartContents } from "./CartContents";
import { CheckoutButton } from "./CheckoutButton";

export function CheckoutView() {
  const { cart, pricing: math, cartQuote } = useStore();
  const { categories } = useCatalog();
  const [paying, setPaying] = useState(false);

  if (cart.length === 0) {
    return (
      <main className="wrap-s" style={{ padding: "64px 0" }}>
        <h1 className="k page-title">הסל ריק</h1>
        <p className="muted" style={{ fontSize: 17, margin: "16px 0 24px" }}>אין מה לשלם עליו עדיין.</p>
        <Link href={categories[0] ? "/c/" + categories[0].id : "/"} className="btn" style={{ height: 56, padding: "0 24px" }}>להתחיל לקנות</Link>
      </main>
    );
  }

  return (
    <main className="wrap-s" style={{ padding: "clamp(20px, 4vw, 48px) clamp(16px, 4vw, 40px) 64px" }}>
      <div className="checkout-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <h1 className="k page-title">לפני התשלום</h1>
          <p style={{ margin: 0, fontSize: 17, lineHeight: 1.6 }}>
            בדקו את הפריטים בהזמנה. אפשר לשנות צבע, מידה וכמות לפני המעבר לתשלום.
          </p>
          <p className="muted" style={{ margin: 0, fontSize: 16, lineHeight: 1.6 }}>
            הכתובת, המשלוח ואמצעי התשלום ייבחרו בקופה המאובטחת של Shopify.
          </p>
          <CheckoutButton onPendingChange={setPaying} />
        </div>
        <aside className="aside-box">
          <span style={{ fontSize: 17, fontWeight: 800 }}>סיכום הזמנה · {math.count === 1 ? "פריט אחד" : math.count + " פריטים"}</span>
          <CartContents disabled={paying} />
          <div style={{ borderTop: "1px solid #D6D6D1", paddingTop: 14, display: "flex", flexDirection: "column", gap: 8, fontSize: 15 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}><span>לפני הנחות</span><span>{cartQuote.error ? "-" : fmt(math.regular)}</span></div>
            {cartQuote.quote && math.savings > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800 }}>
                <span style={{ background: "#FFD100", padding: "0 6px" }}>הנחות</span>
                <span dir="ltr">-{fmt(math.savings)}</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between" }}><span>משלוח</span><span>יחושב בקופה</span></div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 20, fontWeight: 800, borderTop: "2px solid #111", paddingTop: 12, marginTop: 4 }}>
              <span>{cartQuote.pending ? "סכום משוער" : "סה״כ מוצרים"}</span><span aria-live="polite">{cartQuote.error ? "-" : fmt(math.total)}</span>
            </div>
            {cartQuote.pending && <span className="muted" role="status">מאמתים מחירים ומבצעים…</span>}
          </div>
        </aside>
      </div>
    </main>
  );
}

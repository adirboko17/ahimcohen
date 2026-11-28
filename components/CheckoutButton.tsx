"use client";

import { useEffect, useRef, useState } from "react";
import { beginShopifyCheckout } from "@/app/actions/shopify-checkout";
import { useStore } from "@/lib/store";
import { rememberCheckout } from "@/lib/checkout-return";

export function CheckoutButton({ onPendingChange }: { onPendingChange?: (pending: boolean) => void }) {
  const { cart, cartQuote } = useStore();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      // Back from checkout can restore the pending UI from the browser's page cache.
      busy.current = false;
      setPending(false);
      setError("");
      onPendingChange?.(false);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [onPendingChange]);
  async function checkout() {
    if (busy.current || !cart.length || !cartQuote.quote) return;
    busy.current = true;
    setPending(true);
    setError("");
    onPendingChange?.(true);
    try {
      const result = await beginShopifyCheckout(cart.map(({ pid, color, size, qty, variantId, packUnits }) => ({ pid, color, size, qty, variantId, packUnits })), cartQuote.quote.total);
      if (result.ok) {
        rememberCheckout(localStorage, result.receipt, cart);
        window.location.assign(result.checkoutUrl);
        return;
      }
      setError(result.error);
      cartQuote.retry();
    } catch {
      setError("לא הצלחנו לפתוח את התשלום. נסו שוב.");
    }
    busy.current = false;
    setPending(false);
    onPendingChange?.(false);
  }
  return <>
    <p className="policy-note">התשלום מתבצע אצל Shopify. פרטי הקשר, המשלוח והתשלום דרושים לטיפול ברכישה. <a href="/info/terms">תקנון הרכישה והביטולים</a> · <a href="/info/privacy">מדיניות הפרטיות וזכויותיכם</a></p>
    {cartQuote.error && <p role="alert" className="err">{cartQuote.error} <button type="button" className="cart-edit-link" onClick={cartQuote.retry}>ניסיון נוסף</button></p>}
    {error && <p role="alert" className="err" style={{ margin: 0 }}>{error}</p>}
    <button type="button" className="btn" style={{ width: "100%", height: 58, fontSize: 16 }} disabled={pending || !cart.length || !cartQuote.quote} aria-busy={pending || cartQuote.pending} onClick={() => void checkout()}>
      {pending ? "פותחים תשלום מאובטח…" : cartQuote.pending ? "מעדכנים מחיר ומבצעים…" : "מעבר לתשלום"}
    </button>
  </>;
}

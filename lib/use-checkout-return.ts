"use client";

import { useEffect } from "react";
import { checkShopifyCheckout } from "@/app/actions/checkout-status";
import { CART_STORAGE, CHECKOUT_STORAGE, consumeCheckout, pendingCheckouts } from "./checkout-return";
import type { CartLine } from "./types";

const RETRY_DELAYS = [2000, 5000, 15000, 30000, 60000, 120000];

export function useCheckoutReturn(ready: boolean, restoreCart: (cart: CartLine[]) => void) {
  useEffect(() => {
    if (!ready) return;
    let disposed = false;
    let checking = false;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const syncCart = () => {
      try {
        const saved = JSON.parse(localStorage.getItem(CART_STORAGE) || "[]");
        if (Array.isArray(saved)) restoreCart(saved);
      } catch { /* Keep the current cart if browser storage is unavailable. */ }
    };
    const check = async () => {
      if (checking || disposed || document.visibilityState === "hidden") return;
      checking = true;
      try {
        const pending = pendingCheckouts(localStorage);
        for (const entry of pending) {
          const { status } = await checkShopifyCheckout(entry.receipt);
          if (disposed) return;
          if (status === "completed") {
            const cart = consumeCheckout(localStorage, entry.receipt);
            if (cart) restoreCart(cart);
          } else if (status === "expired") {
            localStorage.setItem(CHECKOUT_STORAGE, JSON.stringify(pendingCheckouts(localStorage).filter((item) => item.receipt !== entry.receipt)));
          }
        }
      } catch { /* Failure to verify payment must never empty the cart. */ }
      finally {
        checking = false;
        if (!disposed && retry < RETRY_DELAYS.length && pendingCheckouts(localStorage).length) {
          timer = setTimeout(() => { retry++; void check(); }, RETRY_DELAYS[retry]);
        }
      }
    };
    const onReturn = () => {
      if (document.visibilityState === "hidden") return;
      clearTimeout(timer);
      syncCart();
      retry = 0;
      void check();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === CART_STORAGE) syncCart();
    };
    void check();
    window.addEventListener("pageshow", onReturn);
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("storage", onStorage);
    return () => {
      disposed = true;
      clearTimeout(timer);
      window.removeEventListener("pageshow", onReturn);
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("storage", onStorage);
    };
  }, [ready, restoreCart]);
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { cachedCartQuote, invalidateCartQuotes, quoteSignature, requestCartQuote } from "./cart-quote-client";
import type { CartLine } from "./types";
import type { CartQuote } from "./cart-quote";

export function useCartQuote(lines: Pick<CartLine, "pid" | "color" | "size" | "qty" | "variantId" | "packUnits">[], shopperCart = false) {
  const signature = quoteSignature(lines);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; quote?: CartQuote; error?: string }>();
  const key = `${revision}:${signature}`;
  const active = lines.length > 0;
  const retry = useCallback(() => {
    invalidateCartQuotes();
    setRevision((value) => value + 1);
  }, []);
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      // A restored page keeps its cart, but Shopify prices/promotions may have changed.
      if (event.persisted) retry();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [retry]);
  useEffect(() => {
    if (!active) return;
    const cached = cachedCartQuote(signature, shopperCart);
    if (cached) { setResult({ key, quote: cached }); return; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const response = await requestCartQuote(signature, shopperCart);
        if (!cancelled) setResult(response.ok ? { key, quote: response.quote } : { key, error: response.error });
      } catch {
        if (!cancelled) setResult({ key, error: "לא הצלחנו לעדכן את המחיר. נסו שוב." });
      }
    }, 80);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [key, signature, active, shopperCart]);
  const current = active && result?.key === key ? result : undefined;
  const quote = active ? current?.quote ?? cachedCartQuote(signature, shopperCart) : undefined;
  const error = current?.error;
  const pending = active && !current && !quote;
  return useMemo(() => ({ quote, pending, error, retry }), [quote, pending, error, retry]);
}

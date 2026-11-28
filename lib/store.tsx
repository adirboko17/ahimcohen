"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { pickVariant } from "./catalog";
import { useCartAnalytics } from "@/components/StorefrontAnalytics";
import { useCatalog } from "./catalog-context";
import { productSizeOptions, sizeLabel } from "./sizes";
import { productColorIndex } from "./product-selection";
import { updateCartSelection, updateCartUnitSelection } from "./cart-selection";
import { useCartQuote } from "./use-cart-quote";
import { useCheckoutReturn } from "./use-checkout-return";
import { useCustomerAuth, type CustomerAuthConfig } from "./use-customer-auth";
import { lockPageScroll } from "./page-scroll-lock";
import { cartMath } from "./pricing";
import type { AddItem, CartLine } from "./types";

type Sheet = null | "quick";

type Store = {
  cart: CartLine[];
  pricing: ReturnType<typeof cartMath>;
  cartQuote: ReturnType<typeof useCartQuote>;
  cartOpen: boolean;
  menuOpen: boolean;
  menuCat: string | null;
  searchOpen: boolean;
  query: string;
  sheet: Sheet;
  quickId: string;
  qColor: number;
  qSize: string | null;
  toast: string;
  toastOn: boolean;
  account: ReturnType<typeof useCustomerAuth>;
  extraLock: boolean;
  anyOverlay: boolean;
  openCart: () => void;
  openMenu: () => void;
  openSearch: () => void;
  openQuick: (id: string, selection?: { color?: string; size?: string }) => void;
  closeAll: () => void;
  setMenuCat: (id: string | null) => void;
  setQuery: (q: string) => void;
  setQColor: (i: number) => void;
  setQSize: (size: string) => void;
  addMany: (list: AddItem[], openCart?: boolean) => void;
  setQtyLine: (key: string, delta: number) => void;
  setLineSelection: (key: string, selection: { color: string; size: string }) => void;
  setUnitSelection: (key: string, selection: { color: string; size: string }) => void;
  flash: (msg: string) => void;
  setExtraLock: (on: boolean) => void;
};

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children, customerAuth }: { children: React.ReactNode; customerAuth: CustomerAuthConfig }) {
  const catalog = useCatalog();
  const catalogRef = useRef(catalog);
  catalogRef.current = catalog;
  const [cart, setCart] = useState<CartLine[]>([]);
  const cartQuote = useCartQuote(cart);
  const pricing = useMemo(() => ({ ...cartMath(cart), ...cartQuote.quote }), [cart, cartQuote.quote]);
  const [cartOpen, setCartOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuCat, setMenuCat] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [quickId, setQuickId] = useState("p1");
  const [qColor, setQColor] = useState(0);
  const [qSize, setQSize] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [toastOn, setToastOn] = useState(false);
  const account = useCustomerAuth(customerAuth);
  const [extraLockCount, setExtraLockCount] = useState(0);
  const extraLock = extraLockCount > 0;
  const setExtraLock = useCallback((on: boolean) => {
    setExtraLockCount((count) => Math.max(0, count + (on ? 1 : -1)));
  }, []);
  const [ready, setReady] = useState(false);
  useCartAnalytics(ready, cart, cartQuote.quote?.analytics);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("ahim-cart");
      if (raw) {
        const parsed = JSON.parse(raw) as CartLine[];
        if (Array.isArray(parsed)) setCart(parsed.filter((l) => l && catalogRef.current.product(l.pid) && l.qty > 0)
          .map((line) => ({ ...line, instanceId: line.instanceId || crypto.randomUUID() })));
      }
    } catch {
      /* ignore broken storage */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem("ahim-cart", JSON.stringify(cart));
  }, [cart, ready]);

  useCheckoutReturn(ready, setCart);

  const anyOverlay = cartOpen || menuOpen || searchOpen || !!sheet || extraLock;

  useLayoutEffect(() => {
    if (!anyOverlay) return;
    return lockPageScroll();
  }, [anyOverlay]);

  const flash = useCallback((msg: string) => {
    if (timer.current) clearTimeout(timer.current);
    setToast(msg);
    setToastOn(true);
    timer.current = setTimeout(() => setToastOn(false), 2200);
  }, []);

  const closeAll = useCallback(() => {
    setCartOpen(false);
    setMenuOpen(false);
    setSearchOpen(false);
    setSheet(null);
    setMenuCat(null);
  }, []);

  const openCart = useCallback(() => {
    setCartOpen(true);
    setMenuOpen(false);
    setSearchOpen(false);
    setSheet(null);
  }, []);

  const openMenu = useCallback(() => {
    setMenuOpen(true);
    setMenuCat(null);
    setCartOpen(false);
    setSearchOpen(false);
    setSheet(null);
  }, []);

  const openSearch = useCallback(() => {
    setSearchOpen(true);
    setCartOpen(false);
    setMenuOpen(false);
    setSheet(null);
  }, []);

  const openQuick = useCallback((id: string, selection?: { color?: string; size?: string }) => {
    const p = catalog.product(id);
    if (!p) return;
    setQuickId(id);
    const color = productColorIndex(p, selection?.color, selection?.size);
    setQColor(color);
    const sizes = productSizeOptions(p, p.colors[color] || "");
    const requestedSize = selection?.size ? sizeLabel(selection.size) : null;
    setQSize(selection?.size
      ? sizes.find((option) => option.available && option.label === requestedSize)?.label ?? null
      : sizes.length === 1 && sizes[0].available ? sizes[0].label : null);
    setSheet("quick");
    setCartOpen(false);
    setMenuOpen(false);
    setSearchOpen(false);
  }, [catalog]);

  const addMany = useCallback(
    (list: AddItem[], open = false) => {
      setCart((prev) => {
        const next = prev.slice();
        list.forEach(([pid, ci, size, qty, packUnits]) => {
          const p = catalog.product(pid);
          if (!p || qty <= 0) return;
          const color = p.colors[ci] || "";
          const variant = packUnits ? p.choices?.find((choice) => choice.available && (choice.sourceVariantId
            ? choice.sourceVariantId === packUnits[0]?.variantId : choice.color === color && choice.size === size))
            : pickVariant(p, color, size);
          if (packUnits && !variant) return;
          const key = packUnits ? JSON.stringify([pid, variant?.id, packUnits]) : `${pid}|${color}|${size}`;
          const i = next.findIndex((l) => l.key === key);
          if (i >= 0) next[i] = { ...next[i], qty: next[i].qty + qty };
          else next.push({ key, pid, color, size, qty, instanceId: crypto.randomUUID(), variantId: variant?.id, unitPrice: variant?.price ?? p.price, ...(packUnits && { packUnits }) });
        });
        return next;
      });
      setSheet(null);
      setMenuOpen(false);
      setSearchOpen(false);
      setCartOpen(open);
      flash(list.length > 1 ? `${list.length} פריטים נוספו לסל` : "נוסף לסל");
    },
    [catalog, flash]
  );

  const setQtyLine = useCallback((key: string, delta: number) => {
    setCart((prev) => prev.map((l) => (l.key === key ? { ...l, qty: l.qty + delta } : l)).filter((l) => l.qty > 0));
  }, []);

  const setLineSelection = useCallback((key: string, selection: { color: string; size: string }) => {
    setCart((prev) => {
      const line = prev.find((item) => item.key === key);
      const product = line && catalog.product(line.pid);
      return product ? updateCartSelection(prev, key, product, selection) : prev;
    });
  }, [catalog]);

  const setUnitSelection = useCallback((key: string, selection: { color: string; size: string }) => {
    const instanceId = crypto.randomUUID();
    setCart((prev) => {
      const line = prev.find((item) => item.key === key);
      const product = line && catalog.product(line.pid);
      return product ? updateCartUnitSelection(prev, key, product, selection, instanceId) : prev;
    });
  }, [catalog]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAll();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeAll]);

  const value = useMemo<Store>(
    () => ({
      cart,
      pricing,
      cartQuote,
      cartOpen,
      menuOpen,
      menuCat,
      searchOpen,
      query,
      sheet,
      quickId,
      qColor,
      qSize,
      toast,
      toastOn,
      account,
      extraLock,
      anyOverlay,
      openCart,
      openMenu,
      openSearch,
      openQuick,
      closeAll,
      setMenuCat,
      setQuery,
      setQColor,
      setQSize,
      addMany,
      setQtyLine,
      setLineSelection,
      setUnitSelection,
      flash,
      setExtraLock,
    }),
    [
      cart,
      pricing,
      cartQuote,
      cartOpen,
      menuOpen,
      menuCat,
      searchOpen,
      query,
      sheet,
      quickId,
      qColor,
      qSize,
      toast,
      toastOn,
      account,
      extraLock,
      anyOverlay,
      openCart,
      openMenu,
      openSearch,
      openQuick,
      closeAll,
      addMany,
      setQtyLine,
      setLineSelection,
      setUnitSelection,
      flash,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore");
  return ctx;
}

export function useScrollLock(on: boolean) {
  const { setExtraLock } = useStore();
  useLayoutEffect(() => {
    if (!on) return;
    // Acquire before focus or dialog effects can move the viewport. Each
    // overlay owns its lock, so closing one cannot unlock another.
    const release = lockPageScroll();
    setExtraLock(true);
    return () => {
      release();
      setExtraLock(false);
    };
  }, [on, setExtraLock]);
}

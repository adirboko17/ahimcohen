"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type Dispatch, type MouseEvent, type SetStateAction } from "react";

export type CategoryFilters = { std: string[]; colors: string[]; sizes: string[]; brands: string[]; max: number | null; stock: boolean };
export const EMPTY_CATEGORY_FILTERS: CategoryFilters = { std: [], colors: [], sizes: [], brands: [], max: null, stock: false };
export const CATEGORY_PAGE_SIZE = 8;

type CategoryVisit = {
  filters: CategoryFilters;
  sort: string;
  shown: number;
  scrollY: number;
};

const HistoryContext = createContext<Map<string, CategoryVisit> | null>(null);

// The shared layout stays mounted when opening a product. Keep this map scoped
// to that browser's React tree, never in server module state shared by visitors.
export function CategoryHistoryProvider({ children }: { children: React.ReactNode }) {
  const history = useRef(new Map<string, CategoryVisit>());
  return <HistoryContext.Provider value={history.current}>{children}</HistoryContext.Provider>;
}

// The caller is keyed by category/subcategory, so a new route restores its own
// visit synchronously, including all revealed products, before restoring scroll.
export function useCategoryHistory(catId: string, sub: string | null) {
  const history = useContext(HistoryContext);
  if (!history) throw new Error("CategoryHistoryProvider is required");
  const key = JSON.stringify([catId, sub]);
  const [visit, setVisit] = useState<CategoryVisit>(() => history.get(key) ?? {
    filters: EMPTY_CATEGORY_FILTERS, sort: "pop", shown: CATEGORY_PAGE_SIZE, scrollY: 0,
  });
  const initialScroll = useRef(history.get(key)?.scrollY);
  const scroll = useRef(visit.scrollY);
  const latest = useRef(visit);
  const leaving = useRef(false);
  const [restoring, setRestoring] = useState(initialScroll.current !== undefined);

  useLayoutEffect(() => {
    latest.current = visit;
    history.set(key, { ...visit, scrollY: scroll.current });
  }, [history, key, visit]);

  useLayoutEffect(() => {
    const top = initialScroll.current;
    if (top === undefined) return;
    window.scrollTo({ top, behavior: "instant" });
    // Next's parent layout can also apply route scrolling during this commit.
    // Restore again after it, once the full saved product list is in the DOM.
    const frame = requestAnimationFrame(() => {
      window.scrollTo({ top, behavior: "instant" });
      setRestoring(false);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (restoring) return;
    const rememberScroll = () => {
      const url = new URL(window.location.href);
      if (leaving.current || decodeURIComponent(url.pathname) !== `/c/${catId}` || (url.searchParams.get("sub") || null) !== sub) return;
      scroll.current = window.scrollY;
      history.set(key, { ...latest.current, scrollY: scroll.current });
    };
    window.addEventListener("scroll", rememberScroll, { passive: true });
    return () => window.removeEventListener("scroll", rememberScroll);
  }, [history, key, catId, sub, restoring]);

  const rememberBeforeNavigation = (event: MouseEvent<HTMLElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target;
    if (!(target instanceof Element) || target.closest("button")) return;
    const link = target.closest("a");
    if (!link || (link.target && link.target !== "_self") || link.hasAttribute("download")) return;
    const url = new URL(link.href);
    if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
    scroll.current = window.scrollY;
    history.set(key, { ...latest.current, scrollY: scroll.current });
    // Don't let the next page's scroll-to-top overwrite the category position.
    leaving.current = true;
  };

  const setFilters: Dispatch<SetStateAction<CategoryFilters>> = useCallback((update) => {
    setVisit((current) => ({
      ...current,
      filters: typeof update === "function" ? update(current.filters) : update,
      shown: CATEGORY_PAGE_SIZE,
    }));
  }, []);
  const setSort = useCallback((sort: string) => setVisit((current) => ({ ...current, sort, shown: CATEGORY_PAGE_SIZE })), []);
  const setShown: Dispatch<SetStateAction<number>> = useCallback((update) => {
    setVisit((current) => ({ ...current, shown: typeof update === "function" ? update(current.shown) : update }));
  }, []);

  const clearFilters = () => {
    const cleared = { ...latest.current, filters: EMPTY_CATEGORY_FILTERS, shown: CATEGORY_PAGE_SIZE, scrollY: scroll.current };
    // Clearing a subcategory also returns to "all": don't revive filters saved
    // on an earlier visit to that destination.
    history.set(JSON.stringify([catId, null]), cleared);
    setVisit(cleared);
  };

  return { ...visit, setFilters, setSort, setShown, clearFilters, restoring, rememberBeforeNavigation };
}

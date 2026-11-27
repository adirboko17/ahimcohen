"use client";

import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { CATEGORY_PAGE_SIZE } from "@/lib/category-history";

export function ProductListProgress({ shown, total, paused, setShown, pageSize = CATEGORY_PAGE_SIZE, className = "load-more" }: {
  shown: number;
  total: number;
  paused: boolean;
  setShown: Dispatch<SetStateAction<number>>;
  pageSize?: number;
  className?: string;
}) {
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!sentinel.current || shown >= total || paused) return;
    if (!("IntersectionObserver" in window)) {
      setShown(total);
      return;
    }
    let active = true;
    const observer = new IntersectionObserver((entries) => {
      if (!active || !entries.some((entry) => entry.isIntersecting)) return;
      active = false;
      observer.disconnect();
      setShown((count) => Math.min(count + pageSize, total));
    }, { rootMargin: "0px 0px 500px 0px" });
    observer.observe(sentinel.current);
    return () => { active = false; observer.disconnect(); };
  }, [shown, total, paused, setShown, pageSize]);

  if (!total) return null;
  const visible = Math.min(shown, total);
  return <div className={className} ref={sentinel}>
    <span role="status" aria-live="polite" aria-atomic="true" style={{ fontSize: 14, fontWeight: 600 }}>
      מוצגים {visible} מתוך {total}
    </span>
    <div className="meter" aria-hidden="true"><span style={{ width: `${visible / total * 100}%` }} /></div>
  </div>;
}

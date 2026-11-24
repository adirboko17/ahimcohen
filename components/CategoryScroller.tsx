"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export function CategoryScroller({ children, selected, label }: { children: ReactNode; selected: string | null; label: string }) {
  const track = useRef<HTMLDivElement>(null);
  const trackId = useId();
  const [edges, setEdges] = useState({ right: false, left: false });

  useEffect(() => {
    const row = track.current;
    if (!row) return;
    const measure = () => {
      const bounds = row.getBoundingClientRect();
      const first = row.firstElementChild?.getBoundingClientRect();
      const last = row.lastElementChild?.getBoundingClientRect();
      const right = !!first && first.right > bounds.right + 2;
      const left = !!last && last.left < bounds.left - 2;
      setEdges(previous => previous.right === right && previous.left === left ? previous : { right, left });
    };
    const revealSelected = () => {
      const active = row.querySelector<HTMLElement>(".chip.on");
      if (!active) return;
      const bounds = row.getBoundingClientRect();
      const chip = active.getBoundingClientRect();
      if (chip.left < bounds.left) row.scrollBy({ left: chip.left - bounds.left, behavior: "instant" });
      else if (chip.right > bounds.right) row.scrollBy({ left: chip.right - bounds.right, behavior: "instant" });
    };
    const observer = new ResizeObserver(() => { revealSelected(); measure(); });
    observer.observe(row);
    for (const child of row.children) observer.observe(child);
    row.addEventListener("scroll", measure, { passive: true });
    measure();
    return () => { observer.disconnect(); row.removeEventListener("scroll", measure); };
  }, [selected]);

  const move = (direction: number) => {
    const row = track.current;
    if (!row) return;
    row.scrollBy({ left: direction * row.clientWidth * .75, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  };

  const overflow = edges.right || edges.left;
  return <div className="sub-navigation">
    <button type="button" className="sub-scroll-arrow" hidden={!overflow} disabled={!edges.right} aria-label="גלילת הקטגוריות ימינה" aria-controls={trackId} onClick={() => move(1)}>→</button>
    <div ref={track} id={trackId} className="sub-row scroller" role="group" aria-label={label}>{children}</div>
    <button type="button" className="sub-scroll-arrow" hidden={!overflow} disabled={!edges.left} aria-label="גלילת הקטגוריות שמאלה" aria-controls={trackId} onClick={() => move(-1)}>←</button>
  </div>;
}

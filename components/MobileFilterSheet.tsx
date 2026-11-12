"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";

export function MobileFilterSheet({ children, footer, onClose }: { children: ReactNode; footer: (close: () => void) => ReactNode; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [closing, setClosing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const closingRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const suppressClick = useRef(false);
  const drag = useRef<{ id: number; start: number; last: number; time: number; speed: number; distance: number; moved: boolean } | null>(null);
  const titleId = useId();
  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 220;
    timer.current = setTimeout(() => onCloseRef.current(), delay);
  }, []);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    // Native modal behavior keeps keyboard focus inside and the page behind inert.
    element.showModal();
    // Start on the title, rather than highlighting the full-width drag handle.
    heading.current?.focus({ preventScroll: true });
    return () => { clearTimeout(timer.current); clearTimeout(clickTimer.current); element.close(); };
  }, []);
  const resetDrag = () => {
    drag.current = null;
    setDragging(false);
    dialog.current?.style.setProperty("--filter-drag", "0px");
  };
  return <dialog ref={dialog} className={`mobile-filter-sheet${closing ? " is-closing" : ""}${dragging ? " is-dragging" : ""}`} aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); close(); }}
    onClick={(event) => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientY < bounds.top || event.clientY > bounds.bottom || event.clientX < bounds.left || event.clientX > bounds.right) close();
    }}>
    <button type="button" className="filter-sheet-handle" aria-label="סגירת הסינון — אפשר גם לגרור מטה" onClick={() => {
      if (!suppressClick.current) close();
    }} onPointerDown={(event) => {
      if (closingRef.current || !event.isPrimary || event.button !== 0) return;
      clearTimeout(clickTimer.current);
      suppressClick.current = false;
      drag.current = { id: event.pointerId, start: event.clientY, last: event.clientY, time: event.timeStamp, speed: 0, distance: 0, moved: false };
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(true);
    }} onPointerMove={(event) => {
      const current = drag.current;
      if (!current || current.id !== event.pointerId) return;
      current.distance = Math.max(0, event.clientY - current.start);
      current.speed = (event.clientY - current.last) / Math.max(1, event.timeStamp - current.time);
      current.last = event.clientY;
      current.time = event.timeStamp;
      current.moved ||= Math.abs(event.clientY - current.start) > 4;
      dialog.current?.style.setProperty("--filter-drag", `${current.distance}px`);
    }} onPointerUp={(event) => {
      const current = drag.current;
      if (!current || current.id !== event.pointerId) return;
      suppressClick.current = current.moved;
      clickTimer.current = setTimeout(() => { suppressClick.current = false; }, 0);
      const threshold = Math.min(140, (dialog.current?.clientHeight ?? 600) * .22);
      const fling = current.distance > 24 && current.speed > .65 && event.timeStamp - current.time < 120;
      if (current.distance >= threshold || fling) { drag.current = null; setDragging(false); close(); }
      else resetDrag();
      event.currentTarget.releasePointerCapture(event.pointerId);
    }} onPointerCancel={resetDrag} onLostPointerCapture={() => { if (drag.current) resetDrag(); }}><span aria-hidden="true" /></button>
    <header className="filter-sheet-heading"><h2 ref={heading} id={titleId} tabIndex={-1}>סינון</h2><button type="button" className="x" onClick={close} aria-label="סגירת הסינון">×</button></header>
    <div className="filter-sheet-content">{children}</div>
    <footer className="filter-sheet-footer">{footer(close)}</footer>
  </dialog>;
}

"use client";

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { sendAdminCommand } from "./AdminControls";

type HeroCard = { id: string; content: ReactNode };
type Drag = { id: string; pointerId: number; startY: number; y: number; index?: number; frame?: number };

export function AdminHeroOrder({ cards, returnTo }: { cards: HeroCard[]; returnTo: string }) {
  const router = useRouter();
  const [saved, setSaved] = useState(() => cards.map(({ id }) => id));
  const [order, setOrder] = useState(saved);
  const [drop, setDrop] = useState<{ id: string; index: number } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const list = useRef<HTMLOListElement>(null);
  const drag = useRef<Drag | null>(null);
  const focusAfterMove = useRef<HTMLButtonElement | null>(null);
  const cardById = new Map(cards.map((card) => [card.id, card.content]));
  const dirty = order.some((id, index) => id !== saved[index]);
  const destination = drop && order.indexOf(drop.id) !== drop.index ? order.filter((id) => id !== drop.id) : null;
  const before = drop && destination?.[drop.index];
  const after = drop && destination && drop.index === destination.length ? destination.at(-1) : undefined;

  useEffect(() => () => { if (drag.current?.frame) cancelAnimationFrame(drag.current.frame); }, []);
  useEffect(() => {
    focusAfterMove.current?.focus();
    focusAfterMove.current = null;
  }, [order]);

  function move(id: string, to: number) {
    const from = order.indexOf(id);
    if (from < 0 || from === to || to < 0 || to >= order.length) return;
    const next = order.slice();
    next.splice(from, 1);
    next.splice(to, 0, id);
    setOrder(next);
    setError("");
    setAnnouncement(`הבאנר הועבר למקום ${to + 1} מתוך ${order.length}.`);
  }

  function updateDrop(gesture: Drag) {
    if (!list.current) return;
    const otherCards = Array.from(list.current.children).filter((card) => card.getAttribute("data-hero-order-id") !== gesture.id);
    const beforeIndex = otherCards.findIndex((card) => {
      const { top, height } = card.getBoundingClientRect();
      return gesture.y < top + height / 2;
    });
    const index = beforeIndex < 0 ? otherCards.length : beforeIndex;
    if (gesture.index === index) return;
    gesture.index = index;
    setDrop({ id: gesture.id, index });
  }

  function scrollWhileDragging() {
    const gesture = drag.current;
    if (!gesture) return;
    const direction = gesture.y < 128 ? -1 : gesture.y > window.innerHeight - 64 ? 1 : 0;
    if (direction) {
      const previousY = window.scrollY;
      window.scrollBy({ top: 12 * direction, behavior: "instant" });
      if (window.scrollY !== previousY) updateDrop(gesture);
    }
    gesture.frame = requestAnimationFrame(scrollWhileDragging);
  }

  function startDrag(event: PointerEvent<HTMLButtonElement>, id: string) {
    if (pending || drag.current || !event.isPrimary || event.button !== 0) return;
    drag.current = { id, pointerId: event.pointerId, startY: event.clientY, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function trackDrag(event: PointerEvent<HTMLOListElement>) {
    const gesture = drag.current;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    gesture.y = event.clientY;
    if (gesture.index === undefined && Math.abs(gesture.y - gesture.startY) < 6) return;
    updateDrop(gesture);
    gesture.frame ??= requestAnimationFrame(scrollWhileDragging);
  }

  function finishDrag(commit: boolean) {
    const gesture = drag.current;
    if (!gesture) return;
    drag.current = null;
    if (gesture.frame) cancelAnimationFrame(gesture.frame);
    if (commit && gesture.index !== undefined) move(gesture.id, gesture.index);
    setDrop(null);
  }

  async function saveOrder() {
    if (!dirty || pending || drag.current) return;
    setPending(true);
    setError("");
    const data = new FormData();
    data.set("section", "heroes");
    data.set("operation", "reorder");
    saved.forEach((id) => data.append("previousHeroId", id));
    order.forEach((id) => data.append("heroId", id));
    try {
      const result = await sendAdminCommand(data);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSaved(order);
      router.replace(`${returnTo}&saved=1`, { scroll: false });
      router.refresh();
    } catch {
      setError("שמירת הסדר נכשלה. נסו שוב.");
    } finally {
      setPending(false);
    }
  }

  return <section className="admin-hero-order" aria-label="סדר תצוגת הבאנרים">
    <div className="admin-panel admin-hero-order-toolbar">
      <p id="admin-hero-order-help">גררו את ידיות המיקום כדי לשנות את הסדר. הבאנר הפעיל העליון יוצג ראשון בדף הבית.</p>
      <div className="admin-hero-order-buttons">
        {dirty && <button type="button" className="btn btn-line" disabled={pending || !!drop} onClick={() => {
          setOrder(saved);
          setError("");
          setAnnouncement("הסדר השמור שוחזר.");
        }}>ביטול</button>}
        <button type="button" className="btn admin-primary" disabled={!dirty || pending || !!drop} onClick={saveOrder}>
          {pending ? "שומרים…" : "שמירת סדר"}
        </button>
      </div>
      {error && <p className="admin-feedback" role="alert">{error}</p>}
    </div>
    <span className="admin-hero-order-announcement" role="status">{announcement}</span>
    <ol className="admin-hero-sort-list" ref={list} onPointerMove={trackDrag}
      onPointerUp={(event) => { if (drag.current?.pointerId === event.pointerId) finishDrag(true); }}
      onPointerCancel={(event) => { if (drag.current?.pointerId === event.pointerId) finishDrag(false); }}
      onLostPointerCapture={(event) => { if (drag.current?.pointerId === event.pointerId) finishDrag(false); }}>
      {order.map((id, index) => <li className="admin-hero-sort-item" key={id} data-hero-order-id={id}
        data-dragging={drop?.id === id || undefined} data-drop={before === id ? "before" : after === id ? "after" : undefined}>
        <button className="admin-hero-drag-handle" type="button" disabled={pending}
          aria-label={`שינוי מיקום הבאנר שבמקום ${index + 1}`} aria-describedby="admin-hero-order-help"
          aria-keyshortcuts="ArrowUp ArrowDown" title="גרירה או מעבר עם החצים במקלדת"
          onPointerDown={(event) => startDrag(event, id)}
          onKeyDown={(event) => {
            if (event.key === "Escape") finishDrag(false);
            if (drag.current || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
            event.preventDefault();
            focusAfterMove.current = event.currentTarget;
            move(id, index + (event.key === "ArrowUp" ? -1 : 1));
          }}>
          <svg width="15" height="18" viewBox="0 0 15 18" fill="currentColor" aria-hidden="true">
            <circle cx="5" cy="4" r="1.4"/><circle cx="10" cy="4" r="1.4"/>
            <circle cx="5" cy="9" r="1.4"/><circle cx="10" cy="9" r="1.4"/>
            <circle cx="5" cy="14" r="1.4"/><circle cx="10" cy="14" r="1.4"/>
          </svg>
          <span>מיקום {index + 1}</span>
        </button>
        {cardById.get(id)}
      </li>)}
    </ol>
  </section>;
}

"use client";

import { useEffect, useRef, useState } from "react";

const storageKey = "ahim-accessibility";
const options = [
  ["links", "קו תחתון לקישורים"],
  ["focus", "מסגרת מודגשת במיקוד מקלדת"],
] as const;
type Option = typeof options[number][0];

export function AccessibilityTools() {
  const panel = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState<Option[]>([]);

  useEffect(() => {
    let initial: Option[] = [];
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
      if (Array.isArray(saved)) initial = options.map(([id]) => id).filter(id => saved.includes(id));
    } catch { /* The controls also work with browser storage disabled. */ }
    document.documentElement.dataset.accessibility = initial.join(" ");
    setSelected(initial);
    return () => { delete document.documentElement.dataset.accessibility; };
  }, []);

  function apply(next: Option[]) {
    setSelected(next);
    document.documentElement.dataset.accessibility = next.join(" ");
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Session-only setting. */ }
  }

  return <>
    <button type="button" className="access-launch" aria-haspopup="dialog" aria-controls="access-tools"
      onClick={() => panel.current?.showModal()}>נגישות</button>
    <dialog id="access-tools" ref={panel} className="access-dialog" aria-labelledby="access-heading">
      <header><h2 id="access-heading">אפשרויות נגישות</h2>
        <button type="button" onClick={() => panel.current?.close()}>סגירה</button></header>
      {options.map(([id, label]) => <label key={id}>
        <input type="checkbox" checked={selected.includes(id)}
          onChange={event => apply(event.target.checked ? [...selected, id] : selected.filter(key => key !== id))} />
        {label}
      </label>)}
      <p>להגדלת כל התצוגה אפשר להשתמש בזום של הדפדפן. במחשב לחצו על Ctrl ו־+ או על ⌘ ו־+.</p>
      <a href="/info/accessibility">הצהרת נגישות ופרטי קשר</a>
    </dialog>
  </>;
}

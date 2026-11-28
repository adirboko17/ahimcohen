"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import type { Category } from "@/lib/catalog";
import { categoryPathKey, type CategoryEditCommand, type CategoryEditResponse, type CategoryEditSummary, type CategoryPath } from "@/lib/category-sorting";
import { IconCheck, IconSearch } from "./icons";

type SortAccess = { enabled: true; categories: Category[]; lastEdit: CategoryEditSummary | null } | { enabled: false };
type SortNotice = { error: boolean; text: string };
const endpoint = "/admin/category-sort";

export function useCategorySorting(enabled: boolean) {
  const router = useRouter();
  const [access, setAccess] = useState<SortAccess>({ enabled: false });
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [notice, setNotice] = useState<SortNotice>();
  const submitting = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const request = new AbortController();
    fetch(endpoint, { cache: "no-store", signal: request.signal })
      .then(async response => {
        if (response.ok && !request.signal.aborted) {
          const data: SortAccess = await response.json();
          if (!request.signal.aborted) setAccess(data);
        }
      }).catch(() => {});
    return () => request.abort();
  }, [enabled]);

  async function submit(command: CategoryEditCommand, onSaved?: () => void) {
    if (submitting.current || refreshing) return;
    submitting.current = true;
    setSaving(true);
    setNotice(undefined);
    try {
      const response = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command),
      });
      const result: CategoryEditResponse = await response.json();
      if ("lastEdit" in result) {
        const lastEdit = result.lastEdit ?? null;
        setAccess(current => current.enabled ? { ...current, lastEdit } : current);
      }
      if (!result.ok) {
        setNotice({ error: true, text: result.message });
        if (response.status === 409) startRefresh(() => router.refresh());
        return;
      }
      const verb = command.operation === "add" ? "נוספו" : "הועברו";
      const message = command.operation === "undo" ? "הפעולה בוטלה והשיוכים הקודמים שוחזרו."
        : result.count === 1 ? command.operation === "add" ? "המוצר נוסף לקטגוריה." : "המוצר הועבר."
        : `${result.count} מוצרים ${verb}.`;
      setNotice({ error: false, text: message });
      onSaved?.();
      startRefresh(() => router.refresh());
    } catch {
      setNotice({ error: true, text: "לא ניתן היה לשמור. אפשר לנסות שוב." });
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  return {
    access, editing: enabled && access.enabled && editing, setEditing, busy: saving || refreshing,
    notice, clearNotice: () => setNotice(undefined), submit,
  };
}

export function SortProductCard({ name, checked, disabled, onChange, children }: {
  name: string; checked: boolean; disabled: boolean; onChange: () => void; children: ReactNode;
}) {
  return <div className="category-sort-card" data-selected={checked}>
    <div inert>{children}</div>
    <input type="checkbox" aria-label={`בחירת ${name}`} checked={checked} disabled={disabled} onChange={onChange} />
    <span className="category-sort-check" aria-hidden="true">{checked && <IconCheck size={20} />}</span>
  </div>;
}

type EditableCommand = Extract<CategoryEditCommand, { products: string[] }>;

export function CategorySortDialog({ source, categories, products, saving, notice, onClose, onSubmit }: {
  source: CategoryPath; categories: Category[]; products: string[]; saving: boolean; notice?: SortNotice;
  onClose: () => void; onSubmit: (command: EditableCommand) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const title = useId();
  const attempt = useRef<{ key: string; id: string } | undefined>(undefined);
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<CategoryPath>();
  const [also, setAlso] = useState(false);
  const sourceKey = categoryPathKey(source);
  const sourceName = categories.find(category => category.id === source.parentId)?.name;
  const search = query.trim().toLocaleLowerCase("he-IL");
  const choices = categories.flatMap(({ id, name, subs }) => ["", ...subs].map(sub => ({
    path: { parentId: id, sub }, label: sub ? `${name} › ${sub}` : name,
  }))).filter(({ path, label }) => categoryPathKey(path) !== sourceKey && label.toLocaleLowerCase("he-IL").includes(search));
  const targetKey = target && categoryPathKey(target);

  useEffect(() => {
    const panel = dialog.current;
    panel?.showModal();
    searchRef.current?.focus();
    return () => panel?.close();
  }, []);

  function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!target || saving) return;
    const operation = also ? "add" : "move";
    const key = JSON.stringify([operation, target]);
    if (attempt.current?.key !== key) attempt.current = { key, id: crypto.randomUUID() };
    onSubmit({ id: attempt.current.id, operation, source, target, products });
  }

  return <dialog ref={dialog} className="category-sort-dialog" aria-labelledby={title}
    onCancel={event => { event.preventDefault(); if (!saving) onClose(); }}>
    <form onSubmit={confirm}>
      <header>
        <h2 id={title}>בחירת קטגוריית יעד</h2>
        <p>{products.length} מוצרים מתוך {source.sub ? `${sourceName} › ${source.sub}` : sourceName}</p>
      </header>
      <label className="category-sort-search">
        <IconSearch size={18} />
        <input ref={searchRef} type="search" aria-label="חיפוש קטגוריה או תת־קטגוריה" placeholder="חיפוש קטגוריה או תת־קטגוריה" value={query}
          disabled={saving} onChange={event => { setQuery(event.target.value); setTarget(undefined); }} />
      </label>
      <div className="category-sort-choices" role="group" aria-label="קטגוריית יעד">
        {choices.map(({ path, label }) => {
          const key = categoryPathKey(path);
          return <label key={key} data-current={targetKey === key} className="category-sort-choice">
            <input type="radio" name="destination" checked={targetKey === key} onChange={() => setTarget(path)} disabled={saving} />
            <span>{label}</span>
          </label>;
        })}
        {!choices.length && <p>לא נמצאו קטגוריות מתאימות.</p>}
      </div>
      <label className="category-sort-keep">
        <input type="checkbox" checked={also} onChange={event => setAlso(event.target.checked)} disabled={saving} />
        להוסיף ליעד ולשמור גם את השיוך למקור
      </label>
      {!source.sub && !also && <p className="category-sort-hint">העברה מקטגוריה ראשית מסירה גם את השיוכים לתתי־הקטגוריות שלה.</p>}
      {notice?.error && <p className="category-sort-error" role="alert">{notice.text}</p>}
      <footer>
        <button type="button" className="btn btn-line" onClick={onClose} disabled={saving}>סגירה</button>
        <button type="submit" className="btn" disabled={saving || !target}>{saving ? "שומרים…" : also ? "הוסף לקטגוריה" : "העבר מוצרים"}</button>
      </footer>
    </form>
  </dialog>;
}

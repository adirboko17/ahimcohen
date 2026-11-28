"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { SupplierPublicationProgress } from "@/lib/suppliers/import-queue";

const updateInterval = 8000;
const number = new Intl.NumberFormat("he-IL");

function readTrackedIds(key: string): string[] | null {
  try {
    const stored: unknown = JSON.parse(sessionStorage.getItem(key) ?? "null");
    return Array.isArray(stored) && stored.length &&
      stored.every(id => typeof id === "string" && /^\d+$/.test(id)) ? stored : null;
  } catch {
    return null;
  }
}

function saveTrackedIds(key: string, ids: string[] | null) {
  try {
    if (ids) sessionStorage.setItem(key, JSON.stringify(ids));
    else sessionStorage.removeItem(key);
  } catch {
    // Publication tracking still works while this page is open.
  }
}

export function useSupplierPublicationProgress(domain: string) {
  const key = "ahim:supplier-publication:" + domain;
  const router = useRouter();
  const [scope, setScope] = useState<string[] | null>();
  const [progress, setProgress] = useState<SupplierPublicationProgress | null>(null);
  const [failed, setFailed] = useState(0);
  const tracked = useRef<string[] | null>(null);
  const wasActive = useRef(false);

  useEffect(() => {
    tracked.current = readTrackedIds(key);
    setScope(tracked.current);
  }, [key]);

  useEffect(() => {
    if (scope === undefined) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      if (!document.hidden) {
        try {
          const form = new FormData();
          form.set("action", "publication-progress");
          form.set("domain", domain);
          if (scope) form.set("items", JSON.stringify(scope));
          if (wasActive.current) form.set("active", "true");
          const response = await fetch("/admin/suppliers", { method: "POST", body: form, signal: controller.signal });
          if (response.status === 403) return;
          if (!response.ok) throw new Error("Could not read publication progress.");
          const data = await response.json() as SupplierPublicationProgress;
          if (controller.signal.aborted || scope !== tracked.current) return;
          if (!data.pending) {
            if (scope || wasActive.current) setFailed(data.failed);
            if (wasActive.current) router.refresh();
            wasActive.current = false;
            tracked.current = null;
            saveTrackedIds(key, null);
            setProgress(null);
            return;
          }
          wasActive.current = true;
          setProgress(data);
        } catch {
          // Retain the last confirmed count if a polling request fails.
        }
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, updateInterval);
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [domain, key, router, scope]);

  function track(ids: string[]) {
    if (!ids.length) return;
    const previous = tracked.current;
    const next = [...new Set([...(previous ?? []), ...ids])];
    const added = next.length - (previous?.length ?? 0);
    tracked.current = next;
    saveTrackedIds(key, next);
    setFailed(0);
    setProgress(current => current && previous ? { ...current, total: current.total + added, pending: current.pending + added } :
      { total: next.length, published: 0, pending: next.length, failed: 0, excluded: 0 });
    setScope(next);
  }

  return { progress, failed, track };
}

export function SupplierPublicationStatus({ progress, failed, queuing }: {
  progress: SupplierPublicationProgress | null;
  failed: number;
  queuing: boolean;
}) {
  if (!progress && !queuing) {
    return failed > 0 ? <p className="admin-feedback" data-ok="false" role="status">
      {number.format(failed)} מוצרים לא פורסמו. אפשר לבדוק את השגיאות בכרטיסי המוצרים.
    </p> : null;
  }
  return <section className="supplier-publication-progress" aria-label="פרסום מוצרים באתר">
    <p role="status">
      <strong>{progress ? "פרסום מוצרים באתר" : "מוסיף מוצרים לתור הפרסום…"}</strong>
      {progress && <span>{number.format(progress.published)} מתוך {number.format(progress.total)} מוצרים פורסמו</span>}
    </p>
    <progress aria-label="מוצרים שפורסמו" max={progress?.total ?? 1} value={progress?.published} />
    {progress && <small>
      {number.format(progress.pending)} ממתינים או בעבודה
      {progress.failed > 0 && <> · {number.format(progress.failed)} נכשלו</>}
      {progress.excluded > 0 && <> · {number.format(progress.excluded)} הוסרו מהייבוא</>}
    </small>}
  </section>;
}

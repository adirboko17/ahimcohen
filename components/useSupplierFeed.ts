"use client";

import { useEffect, useRef, useState } from "react";
type Batch<T> = { items: T[]; more: boolean };
type LoadedBatch<T> = { data: Batch<T>; initial: Batch<T> };

export function useSupplierFeed<T>(domain: string, category: string, initial: Batch<T>, returnPage: number, importedOnly: boolean,
  action = "catalog-batch") {
  const [depth, setDepth] = useState(returnPage);
  const [loaded, setLoaded] = useState<LoadedBatch<T>[]>([]);
  const [failure, setFailure] = useState<{ initial: Batch<T>; message: string } | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const restore = useRef(returnPage > 1);
  const batches = [initial];
  for (const batch of loaded) {
    if (!batches[batches.length - 1].more) break;
    batches.push(batch.data);
  }
  const more = batches[batches.length - 1].more;
  // Revalidate already visible cards after admin edits and worker updates.
  const stale = loaded.slice(0, batches.length - 1).findIndex(batch => batch.initial !== initial);
  const next = stale >= 0 ? stale + 2 : more && batches.length < depth ? batches.length + 1 : null;
  const error = failure?.initial === initial ? failure.message : null;

  useEffect(() => {
    if (next === null || error) return;
    const controller = new AbortController();
    async function read(page: number) {
      const body = new FormData();
      body.set("action", action);
      body.set("domain",domain);
      body.set("category",category);
      if (importedOnly) body.set("status","imported");
      body.set("page",String(page));
      const res = await fetch("/admin/suppliers",{method:"POST",body,signal:controller.signal});
      const result = await res.json();
      if (!res.ok || !Array.isArray(result.items) || typeof result.more !== "boolean")
        throw new Error(result.message || "טעינת המוצרים נכשלה.");
      if (controller.signal.aborted) return;
      setLoaded(previous => {
        const updated = previous.slice();
        updated[page - 2] = {data:result,initial};
        return result.more ? updated : updated.slice(0,page - 1);
      });
    }
    void read(next).catch(reason => {
      if (!controller.signal.aborted) setFailure({initial,message:reason instanceof TypeError ? "החיבור לקטלוג נקטע." : "טעינת המוצרים נכשלה."});
    });
    return () => controller.abort();
  },[category, domain, importedOnly, initial, next, error, action]);

  const count = batches.length;
  useEffect(() => {
    const target = sentinel.current;
    if (!target || !more || next !== null || error || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        observer.disconnect();
        setDepth(count + 1);
      }
    },{rootMargin:"0px 0px 400px"});
    observer.observe(target);
    return () => observer.disconnect();
  },[count, more, next, error]);

  useEffect(() => {
    if (!restore.current || (count < returnPage && more)) return;
    restore.current = false;
    const anchor = document.getElementById(window.location.hash.slice(1)) ||
      document.querySelector(`[data-catalog-page="${count}"]`);
    anchor?.scrollIntoView({block:"start"});
  },[count, returnPage, more]);

  return {batches,more,sentinel,error,loading:next !== null && !error,loadMore() {
    if (error) setFailure(null);
    else setDepth(count + 1);
  }};
}

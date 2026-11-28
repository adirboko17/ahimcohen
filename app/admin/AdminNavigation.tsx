"use client";

import type { ReactNode } from "react";

export function AdminNavigation({ children }: { children: ReactNode }) {
  return <nav aria-label="כלי ניהול" className="admin-nav" onClick={event => {
    const group = event.target instanceof Element ? event.target.closest("summary")?.parentElement : null;
    if (!(group instanceof HTMLDetailsElement) || group.open) return;
    for (const other of event.currentTarget.querySelectorAll<HTMLDetailsElement>("details[open]")) {
      if (other !== group) other.open = false;
    }
  }}>{children}</nav>;
}

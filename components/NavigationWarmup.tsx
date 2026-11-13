"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { startNavigationWarmup } from "@/lib/navigation-warmup";

export function NavigationWarmup() {
  const path = usePathname();
  const router = useRouter();
  const warmed = useRef(new Map<string, number>());

  useEffect(() => {
    // Full prefetch is meaningful in production; avoid compiling speculative
    // routes in development or warming shopping pages during checkout.
    if (process.env.NODE_ENV !== "production" || path === "/checkout" || path === "/account") return;
    return startNavigationWarmup(href => router.prefetch(href), warmed.current);
  }, [path, router]);

  return null;
}

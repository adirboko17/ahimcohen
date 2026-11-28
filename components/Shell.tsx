"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useStore } from "@/lib/store";
import { CategoryHistoryProvider } from "@/lib/category-history";
import { Announcement, CheckoutHeader, Header } from "./Header";
import { Footer } from "./Footer";
import { Overlays } from "./Overlays";
import { NavigationWarmup } from "./NavigationWarmup";
import { AccessibilityTools } from "./AccessibilityTools";

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { closeAll } = useStore();
  const checkout = path === "/checkout";

  useEffect(() => {
    closeAll();
  }, [path, closeAll]);

  if (path === "/admin" || path.startsWith("/admin/")) return <>{children}</>;

  return (
    <CategoryHistoryProvider>
      <a className="store-skip" href="#store-content">דילוג לתוכן הראשי</a>
      <NavigationWarmup />
      {!checkout && <Announcement />}
      {!checkout && <div className="top-spacer desk" />}
      {!checkout && <Header />}
      {checkout && <CheckoutHeader />}
      <div id="store-content" tabIndex={-1}>{children}</div>
      {!checkout && <Footer />}
      <Overlays />
      <AccessibilityTools />
    </CategoryHistoryProvider>
  );
}

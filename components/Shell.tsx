"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useStore } from "@/lib/store";
import { CategoryHistoryProvider } from "@/lib/category-history";
import { Announcement, CheckoutHeader, Header } from "./Header";
import { Footer } from "./Footer";
import { Overlays } from "./Overlays";

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { closeAll } = useStore();
  const checkout = path === "/checkout";

  useEffect(() => {
    closeAll();
  }, [path, closeAll]);

  return (
    <CategoryHistoryProvider>
      {!checkout && <Announcement />}
      {!checkout && <div className="top-spacer desk" />}
      {!checkout && <Header />}
      {checkout && <CheckoutHeader />}
      <div>{children}</div>
      {!checkout && <Footer />}
      <Overlays />
    </CategoryHistoryProvider>
  );
}

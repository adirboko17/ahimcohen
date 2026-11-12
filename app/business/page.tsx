import type { Metadata } from "next";
import { BusinessView } from "@/components/BusinessView";

export const metadata: Metadata = { title: "הזמנות לעסקים" };

export default function Page() {
  return <BusinessView />;
}

import type { Metadata } from "next";
import { Under100Listing } from "@/components/Under100";

export const metadata: Metadata = { title: "כל המוצרים עד 100 ₪" };

export default function Page() {
  return <Under100Listing />;
}

import type { Metadata } from "next";
import { CheckoutView } from "@/components/CheckoutView";

export const metadata: Metadata = { title: "תשלום" };

export default function Page() {
  return <CheckoutView />;
}

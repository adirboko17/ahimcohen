import type { Metadata } from "next";
import { QuantityOffersView } from "@/components/QuantityOffersView";

export const metadata: Metadata = {
  title: "המבצעים שלנו",
  description: "ביגוד עבודה, נעלי בטיחות וציוד במחיר מיוחד באחים כהן.",
};

export default function Page() {
  return <QuantityOffersView discountedOnly />;
}

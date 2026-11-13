import type { Metadata } from "next";
import { QuantityOffersView } from "@/components/QuantityOffersView";

export const metadata: Metadata = {
  title: "מבצעי כמות",
  description: "כל מבצעי הכמות של האחים כהן - ביגוד עבודה, מארזים וציוד לעסקים ולצוותים.",
};

export default function Page() {
  return <QuantityOffersView />;
}

import type { Metadata } from "next";
import { QuantityOffersView } from "@/components/QuantityOffersView";

export const metadata: Metadata = {
  title: "המבצעים שלנו",
  description: "כל המבצעים של האחים כהן - מוצרים במחיר מיוחד, מבצעי כמות ומארזים לעבודה ולצוותים.",
};

export default function Page() {
  return <QuantityOffersView allOffers />;
}

import type { Metadata } from "next";
import Link from "next/link";
import { BrandGrid } from "@/components/BrandGrid";

export const metadata: Metadata = { title: "המותגים שלנו", description: "מבחר מותגי ביגוד, נעלי עבודה וציוד מגן באחים כהן. בחרו מותג לצפייה במוצרים." };

export default function Page() {
  return <main className="wrap brands-page">
    <nav className="crumbs" aria-label="פירורי לחם"><Link href="/">בית</Link><span>/</span><span className="now">המותגים שלנו</span></nav>
    <BrandGrid />
  </main>;
}

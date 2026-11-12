import type { Metadata } from "next";
import Link from "next/link";
import { BrandGrid } from "@/components/BrandGrid";

export const metadata: Metadata = { title: "המותגים שלנו", description: "מבחר מותגי ביגוד, נעלי עבודה וציוד מגן באחים כהן. בחרו מותג לצפייה במוצרים." };

export default function Page() {
  return <main className="wrap sec">
    <nav className="crumbs" aria-label="פירורי לחם"><Link href="/">בית</Link><span>/</span><span className="now">המותגים שלנו</span></nav>
    <h1 className="k page-title">המותגים שלנו</h1>
    <p className="brands-intro">ביגוד, הנעלה וציוד לעבודה. כל מותג והמוצרים שלו.</p>
    <BrandGrid />
  </main>;
}

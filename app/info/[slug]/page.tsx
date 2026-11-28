import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { INFO } from "@/lib/catalog";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return { title: INFO[slug]?.title || "מידע" };
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  const page = INFO[slug];
  if (!Object.hasOwn(INFO, slug)) notFound();
  const legal = ["terms", "privacy", "accessibility"].includes(slug);
  return (
    <main className="wrap" style={{ paddingTop: "clamp(28px, 5vw, 64px)" }}>
      <div className="crumbs">
        <Link href="/">בית</Link>
        <span>/</span>
        <span className="now">{page.title}</span>
      </div>
      <h1 className="k page-title" style={{ marginBottom: 16 }}>{page.title}</h1>
      <p className="lead" style={{ marginBottom: 28 }}>{page.lead}</p>
      <div className="prose">
        {slug === "terms" && <section id="cancellation" className="legal-cancellation">
          <h2>מסירת הודעת ביטול עסקה</h2>
          <p>אפשר לשלוח הודעה בטופס המקוון של החנות. כתבו בנושא ״ביטול עסקה״ ובגוף ההודעה את שמכם ומספר הזהות. אם יש ברשותכם מספר הזמנה, הוספתו תעזור לאתר אותה. אין לצרף צילום תעודה או פרטי כרטיס אשראי.</p>
          <p><a href="https://ahim-cohenn.myshopify.com/pages/contact#contact_form">פתיחת טופס מקוון לשליחת הודעת ביטול</a></p>
          <p>אפשר גם <a href="mailto:Hazmanot@ahim-cohen.co.il?subject=ביטול%20עסקה">לשלוח הודעת ביטול בדוא״ל</a>, להתקשר ל־<a href="tel:086233803"><bdi>08-6233803</bdi></a>, לפנות בעל פה בחנות או לשלוח דואר רשום להאחים כהן, הפועלים 20, באר שבע.</p>
        </section>}
        {page.blocks.map((b) => (
          <section key={b.h}>
            <h2>{b.h}</h2>
            {b.h === "טלפון" ? (
              <p><a href="tel:08-6233803" style={{ fontWeight: 800, textDecoration: "underline" }}>{b.p}</a></p>
            ) : b.h === "הזמנות" ? (
              <p><a href="mailto:Hazmanot@ahim-cohen.co.il" style={{ fontWeight: 800, textDecoration: "underline" }}>{b.p}</a></p>
            ) : (
              <p>{b.p}</p>
            )}
          </section>
        ))}
        {legal && <section className="legal-contact">
          <h2>{slug === "accessibility" ? "יצירת קשר עם ירדן כהן" : "יצירת קשר עם החנות"}</h2>
          <p><a href="mailto:Hazmanot@ahim-cohen.co.il"><bdi>Hazmanot@ahim-cohen.co.il</bdi></a></p>
          <p>{slug === "accessibility" ? <a href="tel:0508154005"><bdi>050-8154005</bdi></a> : <a href="tel:086233803"><bdi>08-6233803</bdi></a>}</p>
        </section>}
        {slug === "shipping" && <p className="policy-note"><Link href="/info/terms#cancellation">ביטול עסקה ותנאי החזרה</Link></p>}
      </div>
    </main>
  );
}

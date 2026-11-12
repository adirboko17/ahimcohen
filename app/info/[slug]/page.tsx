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
  if (!page) notFound();
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
      </div>
    </main>
  );
}

import type { Metadata } from "next";
import { SearchResults } from "@/components/SearchResults";

export const metadata: Metadata = { title: "תוצאות חיפוש" };

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const { q } = await searchParams;
  const query = (Array.isArray(q) ? q[0] : q)?.trim() ?? "";
  return <SearchResults key={query} query={query} />;
}

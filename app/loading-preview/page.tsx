import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageLoading } from "@/components/PageLoading";

export const metadata: Metadata = {
  title: "תצוגה מקדימה לטעינה",
  robots: { index: false, follow: false },
};

export default function LoadingPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <PageLoading />;
}

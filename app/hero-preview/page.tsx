import type { Metadata } from "next";
import { Home } from "@/components/Home";

export const metadata: Metadata = {
  title: "תצוגה מקדימה להירו",
  robots: { index: false, follow: false },
};

export default async function HeroPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ variant?: string }>;
}) {
  const { variant } = await searchParams;
  return <Home heroPreview={variant === "fade" ? "fade" : "wide"} />;
}

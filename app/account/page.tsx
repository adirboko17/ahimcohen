import type { Metadata } from "next";
import { CustomerDashboard } from "@/components/CustomerDashboard";

export const metadata: Metadata = { title: "החשבון שלי" };

export default function Page() {
  return <CustomerDashboard />;
}

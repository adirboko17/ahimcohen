import type { Metadata } from "next";
import { AccountView } from "@/components/AccountView";

export const metadata: Metadata = { title: "כניסה לאזור האישי" };

export default function LoginPage() {
  return <AccountView />;
}

import Link from "next/link";
import { IconFwd } from "./icons";

export function AdminBackLink({ href, label = "חזרה לרשימה" }: { href: string; label?: string }) {
  return <Link href={href} prefetch={false} className="admin-back-link">
    <IconFwd />
    {label}
  </Link>;
}

import Link from "next/link";

export default function NotFound() {
  return (
    <main className="wrap" style={{ padding: "clamp(40px, 6vw, 80px) var(--gutter) 80px" }}>
      <h1 className="k page-title">העמוד לא נמצא</h1>
      <p className="lead" style={{ margin: "18px 0 28px" }}>הקישור לא מוביל למוצר או לעמוד באתר.</p>
      <Link href="/" className="btn" style={{ height: 56, padding: "0 28px" }}>
        חזרה לדף הבית
      </Link>
    </main>
  );
}

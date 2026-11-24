import { readAdminStore } from "@/lib/admin/storage";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entry = (await readAdminStore()).links.find((item) => item.slug === slug.toLowerCase());
  if (!entry) return new Response("הקישור אינו קיים", { status: 404, headers: { "Cache-Control": "no-store" } });
  const target = new URL(entry.destination, request.url);
  return new Response(null, { status: 307, headers: { Location: target.href, "Cache-Control": "no-store" } });
}

import { publicHeroUrl } from "@/lib/admin/hero-images";

export async function GET(_: Request, { params }: { params: Promise<{ filename: string }> }) {
  const url = publicHeroUrl((await params).filename);
  return url ? Response.redirect(url, 307) : new Response(null, { status: 404 });
}

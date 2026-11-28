import { isAdmin } from "@/lib/admin/access";
import { quoteIdPattern, quoteLogo } from "@/lib/admin/business-quotes";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return new Response(null, { status: 403 });
  const { id } = await params;
  if (!quoteIdPattern.test(id)) return new Response(null, { status: 404 });
  const file = await quoteLogo(id);
  if (!file) return new Response(null, { status: 404 });
  return new Response(file.body, { headers: {
    "Content-Type": "application/octet-stream", "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store",
    "Content-Disposition": "attachment; filename*=UTF-8''" + encodeURIComponent(file.name).replace(/['()*]/g, c => "%" + c.charCodeAt(0).toString(16)),
  } });
}

import { isAdmin } from "@/lib/admin/access";
import { saveAdmin } from "@/lib/admin/commands";
import { adminRequestOrigin } from "@/lib/admin/request-origin";
import { saveAdminReview } from "@/lib/admin/reviews";
import { saveProductSet } from "@/lib/admin/product-sets";

export async function POST(request: Request) {
  if (!adminRequestOrigin(request)) return Response.json({ ok: false, message: "הבקשה לא אושרה." }, { status: 403 });
  if (!(await isAdmin())) return Response.json({ ok: false, message: "הכניסה פגה. התחברו שוב." }, { status: 401 });
  const length = Number(request.headers.get("content-length"));
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data") || length < 1 || length > 9 * 1024 * 1024) {
    return Response.json({ ok: false, message: "הטופס גדול מדי או אינו תקין." }, { status: 400 });
  }
  try {
    const data = await request.formData();
    const section = data.get("section");
    const result = await (section === "sets" ? saveProductSet(data) : section === "reviews" ? saveAdminReview(data) : saveAdmin(data));
    return Response.json(result, { status: result.ok ? 200 : 422, headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false, message: "השמירה נכשלה. נסו שוב." }, { status: 500 });
  }
}

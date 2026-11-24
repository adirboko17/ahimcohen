import { isAdmin } from "@/lib/admin/access";
import { InvalidHeroImage, uploadHero } from "@/lib/admin/hero-images";
import { adminRequestOrigin } from "@/lib/admin/request-origin";

export async function POST(request: Request) {
  if (!adminRequestOrigin(request) || !(await isAdmin())) {
    return Response.json({ ok: false, message: "נדרשת כניסה לניהול." }, { status: 403 });
  }
  const length = Number(request.headers.get("content-length"));
  if (length <= 0 || length > 4 * 1024 * 1024 || !request.headers.get("content-type")?.startsWith("image/")) {
    return Response.json({ ok: false, message: "בחרו תמונה עד 4MB." }, { status: 400 });
  }
  try {
    const { filename } = await uploadHero(new File([await request.blob()], "hero"));
    return Response.json({ ok: true, filename });
  } catch (error) {
    return Response.json({ ok: false, message: error instanceof InvalidHeroImage ? error.message : "העלאת התמונה נכשלה." },
      { status: error instanceof InvalidHeroImage ? 422 : 500 });
  }
}

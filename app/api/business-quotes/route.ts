import { maxLogoBytes } from "@/lib/business-quotes";
import { InvalidQuote, submitBusinessQuote } from "@/lib/admin/business-quotes";
import { adminRequestOrigin } from "@/lib/admin/request-origin";

export async function POST(request: Request) {
  if (!adminRequestOrigin(request)) return new Response(null, { status: 403 });
  if (Number(request.headers.get("content-length")) > maxLogoBytes + 256 * 1024) {
    return Response.json({ message: "הבקשה גדולה מדי. בחרו לוגו בגודל של עד 4 MB." }, { status: 413 });
  }
  let form;
  try { form = await request.formData(); } catch { return Response.json({ message: "טופס הבקשה אינו תקין." }, { status: 400 }); }
  try {
    return Response.json({ id: await submitBusinessQuote(form) }, { status: 201 });
  } catch (error) {
    if (error instanceof InvalidQuote) return Response.json({ message: error.message }, { status: 400 });
    console.error("Could not store business quote", error);
    return Response.json({ message: "לא התקבל אישור שליחה. הפרטים נשמרו בטופס ואפשר לנסות שוב." }, { status: 503 });
  }
}

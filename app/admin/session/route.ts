import { signInAdmin, signOutAdmin } from "@/lib/admin/access";
import { adminRequestOrigin } from "@/lib/admin/request-origin";

export async function POST(request: Request) {
  const origin = adminRequestOrigin(request);
  const contentType = request.headers.get("content-type");
  const length = Number(request.headers.get("content-length"));
  if (!origin || !contentType?.startsWith("application/x-www-form-urlencoded") || length < 1 || length > 8192) {
    return new Response(null, { status: 400 });
  }
  const data = await request.formData();
  const target = new URL("/admin", origin);
  if (data.get("operation") === "logout") {
    await signOutAdmin();
  } else if (data.get("operation") === "login") {
    const error = await signInAdmin(String(data.get("email") ?? ""), String(data.get("password") ?? ""));
    if (error) target.searchParams.set("error", error);
  } else {
    return new Response(null, { status: 400 });
  }
  return new Response(null, { status: 303, headers: { Location: target.href, "Cache-Control": "no-store" } });
}

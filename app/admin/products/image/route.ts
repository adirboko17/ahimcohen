import { isAdmin } from "@/lib/admin/access";
import { adminRequestOrigin } from "@/lib/admin/request-origin";
import { InvalidProductImage, uploadProductImage } from "@/lib/admin/product-image-upload";
import { imageByteLimit, productImageTypes } from "@/lib/product-gallery";

export const maxDuration = 60;

export async function POST(request: Request) {
  if (!adminRequestOrigin(request) || !(await isAdmin())) return Response.json({ message: "נדרשת כניסה לניהול." }, { status: 403 });
  if (!productImageTypes.includes(request.headers.get("content-type") ?? "") || Number(request.headers.get("content-length")) > imageByteLimit)
    return Response.json({ message: "בחרו תמונת JPG, PNG או WebP בגודל של עד 4MB." }, { status: 422 });
  try {
    const receipt = await uploadProductImage(await request.blob(), request.headers.get("x-product-request") ?? "");
    return Response.json({ receipt });
  } catch (cause) {
    const invalid = cause instanceof InvalidProductImage;
    return Response.json({ message: invalid ? cause.message : "העלאת התמונה ל־Shopify נכשלה. נסו שוב." }, { status: invalid ? 422 : 502 });
  }
}

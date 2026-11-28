import { revalidateTag } from "next/cache";
import { isAdmin } from "@/lib/admin/access";
import { InvalidProduct, publishManualProduct, readProductForm } from "@/lib/admin/create-product";
import { adminRequestOrigin } from "@/lib/admin/request-origin";
import { loadShopCatalog } from "@/lib/shopify/load-catalog";
import { InvalidProductImage } from "@/lib/admin/product-image-upload";

export const maxDuration = 120;

export async function GET(request: Request) {
  if (!(await isAdmin())) return Response.json({ ready: false }, { status: 401 });
  const handle = new URL(request.url).searchParams.get("handle") ?? "";
  if (!/^ahim-manual-[a-f0-9-]{36}$/i.test(handle)) return Response.json({ ready: false }, { status: 400 });
  const catalog = await loadShopCatalog(true);
  return Response.json({ ready: catalog.products.some(product => product.id === handle) }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  if (!adminRequestOrigin(request)) return Response.json({ message: "הבקשה לא אושרה." }, { status: 403 });
  if (!(await isAdmin())) return Response.json({ message: "הכניסה פגה. התחברו שוב לניהול החנות." }, { status: 401 });
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data")) {
    return Response.json({ message: "טופס המוצר אינו תקין." }, { status: 400 });
  }
  if (Number(request.headers.get("content-length")) > 4 * 1024 * 1024 + 64 * 1024) {
    return Response.json({ message: "גודל התמונה המרבי הוא 4MB." }, { status: 413 });
  }
  try {
    const form = await request.formData();
    const handle = await publishManualProduct(await readProductForm(form));
    revalidateTag("shop-catalog");
    return Response.json({ handle });
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "פרסום המוצר נכשל. נסו שוב." },
      { status: error instanceof InvalidProduct || error instanceof InvalidProductImage ? 422 : 502 });
  }
}

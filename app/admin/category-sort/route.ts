import { isAdmin } from "@/lib/admin/access";
import { categorySortOptions, CategoryEditConflict, editStorefrontCategories, lastCategoryEdit } from "@/lib/admin/category-sorting";
import { adminRequestOrigin } from "@/lib/admin/request-origin";
import { AdminEditBusy, readAdminStore } from "@/lib/admin/storage";
import { categoryBatchLimit, type CategoryEditCommand, type CategoryPath } from "@/lib/category-sorting";

const headers = { "Cache-Control": "private, no-store" };
const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

export async function GET() {
  if (!(await isAdmin())) return Response.json({ enabled: false }, { headers });
  const store = await readAdminStore();
  return Response.json({ enabled: true, categories: categorySortOptions(store), lastEdit: lastCategoryEdit(store) }, { headers });
}

function validPath(value: unknown): value is CategoryPath {
  if (!value || typeof value !== "object") return false;
  const { parentId, sub } = value as CategoryPath;
  return typeof parentId === "string" && parentId.length > 0 && parentId.length <= 128
    && typeof sub === "string" && sub.length <= 256;
}

function parseCommand(value: unknown): CategoryEditCommand | null {
  if (!value || typeof value !== "object") return null;
  const { id, operation } = value as { id?: unknown; operation?: unknown };
  if (typeof id !== "string" || !uuid.test(id)) return null;
  if (operation === "undo") return { id, operation };
  const { source, target, products } = value as Partial<Extract<CategoryEditCommand, { products: string[] }>>;
  if ((operation !== "move" && operation !== "add") || !validPath(source) || !validPath(target)
    || !Array.isArray(products) || !products.length || products.length > categoryBatchLimit
    || !products.every(handle => typeof handle === "string" && handle.length > 0 && handle.length <= 512)
    || new Set(products).size !== products.length) return null;
  return { id, operation, source, target, products };
}

export async function POST(request: Request) {
  if (!adminRequestOrigin(request)) return Response.json({ ok: false, message: "הבקשה לא אושרה." }, { status: 403, headers });
  if (!(await isAdmin())) return Response.json({ ok: false, message: "הכניסה פגה. התחברו שוב לניהול החנות." }, { status: 401, headers });
  if (!request.headers.get("content-type")?.startsWith("application/json") || Number(request.headers.get("content-length")) > 400 * 1024) {
    return Response.json({ ok: false, message: "הבקשה אינה תקינה." }, { status: 400, headers });
  }
  const command = parseCommand(await request.json().catch(() => null));
  if (!command) return Response.json({ ok: false, message: "הבקשה אינה תקינה." }, { status: 400, headers });
  try {
    return Response.json(await editStorefrontCategories(command), { headers });
  } catch (error) {
    if (error instanceof CategoryEditConflict || error instanceof AdminEditBusy) {
      return Response.json({
        ok: false, message: error.message, ...(error instanceof CategoryEditConflict ? { lastEdit: error.lastEdit } : {}),
      }, { status: 409, headers });
    }
    console.error("Unable to save storefront category changes.", error);
    return Response.json({ ok: false, message: "שמירת השינוי נכשלה. אפשר לנסות שוב." }, { status: 500, headers });
  }
}

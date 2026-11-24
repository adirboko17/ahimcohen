import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { heroDirectory } from "@/lib/admin/storage";

export async function GET(_: Request, { params }: { params: Promise<{ filename: string }> }) {
  const { filename } = await params;
  if (!/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}\.webp$/.test(filename)) return new Response(null, { status: 404 });
  try {
    const bytes = await readFile(join(heroDirectory, filename));
    return new Response(new Uint8Array(bytes), { headers: {
      "Content-Type": "image/webp", "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Response(null, { status: 404 });
    throw error;
  }
}

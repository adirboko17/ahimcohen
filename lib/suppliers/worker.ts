import "server-only";
import { wakeCatalogWorker } from "./sites";

export function startCatalogWorker() {
  if (process.env.VERCEL) return;
  const runtime = globalThis as typeof globalThis & { supplierCatalogTimer?: NodeJS.Timeout };
  if (runtime.supplierCatalogTimer || !(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)) return;
  runtime.supplierCatalogTimer = setInterval(() => {
    void wakeCatalogWorker().catch(() => console.error("Supplier catalog worker could not reach its queue."));
  }, 20000);
  runtime.supplierCatalogTimer.unref();
}

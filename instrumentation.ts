export async function register() {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startCatalogWorker } = await import("@/lib/suppliers/worker");
    startCatalogWorker();
  }
}

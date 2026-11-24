import { claimWakeToken } from "@/lib/suppliers/cloud-worker";
import { wakeCatalogWorker } from "@/lib/suppliers/sites";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  if (!await claimWakeToken(request.headers.get("authorization"))) return new Response(null,{status:403});
  await wakeCatalogWorker();
  return new Response(null,{status:204});
}

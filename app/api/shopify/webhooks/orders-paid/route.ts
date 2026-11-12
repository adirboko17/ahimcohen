import { receivePaidWebhook } from "@/lib/shopify/paid-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return receivePaidWebhook(request);
}

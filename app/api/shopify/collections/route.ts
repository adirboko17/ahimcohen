import { buyerIpFrom } from "@/lib/shopify/client";
import { fetchCollectionsPage } from "@/lib/shopify/collections";
import { ShopifyError } from "@/lib/shopify/config";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const first = Number(url.searchParams.get("first") ?? "20");
    const page = await fetchCollectionsPage({
      first: Number.isInteger(first) ? first : 20,
      after: url.searchParams.get("after"),
      buyerIp: buyerIpFrom(request),
    });
    return Response.json(page);
  } catch (error) {
    if (error instanceof ShopifyError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: "Shopify Storefront request failed." }, { status: 500 });
  }
}

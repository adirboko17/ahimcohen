import { buyerIpFrom } from "@/lib/shopify/client";
import { ShopifyError } from "@/lib/shopify/config";
import { fetchCollectionProductsPage } from "@/lib/shopify/products";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ handle: string }> }) {
  try {
    const { handle } = await context.params;
    const url = new URL(request.url);
    const first = Number(url.searchParams.get("first") ?? "20");
    const page = await fetchCollectionProductsPage({
      handle,
      first: Number.isInteger(first) ? first : 20,
      after: url.searchParams.get("after"),
      buyerIp: buyerIpFrom(request),
    });
    if (!page.collection) return Response.json({ error: "Collection not found." }, { status: 404 });
    return Response.json(page);
  } catch (error) {
    if (error instanceof ShopifyError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: "Shopify Storefront request failed." }, { status: 500 });
  }
}

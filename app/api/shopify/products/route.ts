import { buyerIpFrom } from "@/lib/shopify/client";
import { ShopifyError } from "@/lib/shopify/config";
import { fetchProductsPage } from "@/lib/shopify/products";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const first = Number(url.searchParams.get("first") ?? "20");
    const page = await fetchProductsPage({
      first: Number.isInteger(first) ? first : 20,
      after: url.searchParams.get("after"),
      query: url.searchParams.get("query"),
      buyerIp: buyerIpFrom(request),
    });
    return Response.json(page);
  } catch (error) {
    return errorResponse(error);
  }
}

function errorResponse(error: unknown) {
  if (error instanceof ShopifyError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return Response.json({ error: "Shopify Storefront request failed." }, { status: 500 });
}

import { quoteShopifyCart } from "@/app/actions/shopify-checkout";

export const dynamic = "force-dynamic";

// Price previews use a read-style endpoint rather than the client's action queue.
// Checkout still creates and verifies a fresh Shopify cart independently.
export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  try {
    const body = await request.json();
    if (!Array.isArray(body?.lines) || body.lines.length === 0 || body.lines.length > 50 ||
      body.lines.some((line: unknown) => !line || typeof line !== "object")) {
      return Response.json({ ok: false, error: "הסל לא תקין." }, { status: 400, headers });
    }
    return Response.json(await quoteShopifyCart(body.lines), { headers });
  } catch {
    return Response.json({ ok: false, error: "לא הצלחנו לעדכן את המחיר. נסו שוב." }, { status: 500, headers });
  }
}

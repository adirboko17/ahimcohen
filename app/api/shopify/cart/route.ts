import { addCartLines, createCart, removeCartLines, updateCartLines } from "@/lib/shopify/cart";
import { buyerIpFrom } from "@/lib/shopify/client";
import { ShopifyError } from "@/lib/shopify/config";
import type { CartLineDraft, CartLineUpdate } from "@/lib/shopify/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action?: string;
      cartId?: string;
      lines?: CartLineDraft[] | CartLineUpdate[];
      lineIds?: string[];
    };
    const buyerIp = buyerIpFrom(request);
    if (body.action === "create") {
      return Response.json(await createCart(asDrafts(body.lines), buyerIp));
    }
    if (body.action === "add") {
      return Response.json(await addCartLines(body.cartId ?? "", asDrafts(body.lines), buyerIp));
    }
    if (body.action === "update") {
      return Response.json(await updateCartLines(body.cartId ?? "", asUpdates(body.lines), buyerIp));
    }
    if (body.action === "remove") {
      return Response.json(await removeCartLines(body.cartId ?? "", body.lineIds ?? [], buyerIp));
    }
    return Response.json({ error: "Unknown cart action." }, { status: 400 });
  } catch (error) {
    if (error instanceof ShopifyError) return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: "Shopify cart request failed." }, { status: 500 });
  }
}

function asDrafts(lines: unknown): CartLineDraft[] {
  if (!Array.isArray(lines) || lines.length === 0 || lines.length > 50) {
    throw new ShopifyError("Cart lines are required.", 400);
  }
  return lines.map((line) => {
    const item = line as CartLineDraft;
    return {
      merchandiseId: String(item.merchandiseId ?? ""),
      quantity: Number(item.quantity),
      attributes: Array.isArray(item.attributes)
        ? item.attributes.map((attribute) => ({ key: String(attribute.key ?? ""), value: String(attribute.value ?? "") }))
        : [],
    };
  });
}

function asUpdates(lines: unknown): CartLineUpdate[] {
  if (!Array.isArray(lines) || lines.length === 0 || lines.length > 50) {
    throw new ShopifyError("Cart lines are required.", 400);
  }
  return lines.map((line) => {
    const item = line as CartLineUpdate;
    return { id: String(item.id ?? ""), quantity: Number(item.quantity) };
  });
}

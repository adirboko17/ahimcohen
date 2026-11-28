import { createClient } from "@supabase/supabase-js";
import { customerAuthConfig } from "@/lib/customer-auth-config";
import type { CustomerOrder, HistoryLine, HistoryPage, OrderHistoryPage } from "@/lib/customer-orders";
import { adminGraphQL } from "@/lib/shopify/admin-bundles";
import { storefront } from "@/lib/shopify/client";

export const dynamic = "force-dynamic";
type Connection<T> = { nodes: T[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };
type OrderRow = CustomerOrder & { email: string | null };
type LineRow = { id: string; name: string; quantity: number; customAttributes: { key: string }[];
  lineItemGroup: { id: string } | null; sellingPlan: { name: string } | null; isGiftCard: boolean; variant: { id: string } | null };
const listQuery = `query CustomerHistory($search:String!, $after:String) {
  currentAppInstallation { accessScopes { handle } }
  orders(first:10, after:$after, query:$search, sortKey:CREATED_AT, reverse:true) {
    pageInfo { hasNextPage endCursor }
    nodes { id email name createdAt cancelledAt displayFinancialStatus displayFulfillmentStatus
      currentTotalPriceSet { presentmentMoney { amount currencyCode } } }
  }
}`;
const linesQuery = `query CustomerOrderItems($search:String!, $after:String) {
  orders(first:1, query:$search) { nodes { id email lineItems(first:100, after:$after) {
    pageInfo { hasNextPage endCursor } nodes { id name quantity isGiftCard lineItemGroup { id } sellingPlan { name }
      customAttributes { key } variant { id } }
  } } }
}`;
const onlineQuery = `query ReorderVariants($ids:[ID!]!) {
  nodes(ids:$ids) { ... on ProductVariant { id availableForSale product { handle } } }
}`;

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "private, no-store", Vary: "Authorization" } });
}

export async function GET(request: Request) {
  const config = customerAuthConfig();
  if (!config) return json(null, 503);
  const token = request.headers.get("authorization")?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if (!token || token.length > 16384) return json(null, 401);
  const params = new URL(request.url).searchParams;
  const order = params.get("order");
  const after = params.get("after");
  if ((order !== null && !/^\d{1,20}$/.test(order)) || (after && after.length > 2048)) return json(null, 400);
  try {
    const auth = createClient(config.url, config.key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error } = await auth.auth.getUser(token);
    if (error || !user?.email_confirmed_at || !user.email) return json(null, 401);
    const email = user.email.trim().toLowerCase();
    const search = "email:" + JSON.stringify(email.replace(/([:*()])/g, "\\$1"));
    const owned = (row: { email: string | null }) => row.email?.trim().toLowerCase() === email;
    if (!order) {
      const { orders, currentAppInstallation } = await adminGraphQL<{
        orders: Connection<OrderRow>; currentAppInstallation: { accessScopes: { handle: string }[] }
      }>(listQuery, { search, after });
      const items = orders.nodes.filter(owned).map(({ email: _email, ...row }) => row);
      const allDates = currentAppInstallation.accessScopes.some(scope => scope.handle === "read_all_orders");
      return json({ items, next: orders.pageInfo.hasNextPage ? orders.pageInfo.endCursor : null, allDates } satisfies OrderHistoryPage);
    }
    type Detail = { id: string; email: string | null; lineItems: Connection<LineRow> };
    const { orders } = await adminGraphQL<{ orders: { nodes: Detail[] } }>(linesQuery, { search: search + " AND id:" + order, after });
    const row = orders.nodes[0];
    if (!row || !owned(row) || row.id !== "gid://shopify/Order/" + order) return json(null, 404);
    const eligible = row.lineItems.nodes.filter(line => line.variant && !line.isGiftCard && !line.lineItemGroup &&
      !line.sellingPlan && line.customAttributes.every(a => a.key === "צבע" || a.key === "מידה"));
    const ids = [...new Set(eligible.map(line => line.variant!.id))];
    type Online = { id: string; availableForSale: boolean; product: { handle: string } };
    const { nodes } = ids.length ? await storefront<{ nodes: (Online | null)[] }>(onlineQuery, { ids }) : { nodes: [] };
    const online = new Map(nodes.flatMap(v => v?.availableForSale ? [[v.id, v.product.handle] as const] : []));
    const eligibleIds = new Set(eligible.map(line => line.id));
    const items = row.lineItems.nodes.map(line => {
      const handle = eligibleIds.has(line.id) && line.variant ? online.get(line.variant.id) : null;
      return { id: line.id, name: line.name, quantity: line.quantity, handle: handle ?? null, variantId: handle ? line.variant!.id : null };
    });
    return json({ items, next: row.lineItems.pageInfo.hasNextPage ? row.lineItems.pageInfo.endCursor : null } satisfies HistoryPage<HistoryLine>);
  } catch {
    return json(null, 503);
  }
}

import "server-only";
import { ShopifyError, storefrontAuthHeader, storefrontEndpoint } from "./config";

type GraphqlError = { message?: string };
type GraphqlResult<T> = { data?: T; errors?: GraphqlError[] };

export async function storefront<T>(
  query: string,
  variables?: Record<string, unknown>,
  buyerIp?: string,
): Promise<T> {
  const endpoint = storefrontEndpoint();
  const headers = storefrontHeaders(buyerIp);
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
      headers,
      body: JSON.stringify({ query, variables }),
    });
  } catch (error) {
    if (error instanceof ShopifyError) throw error;
    throw new ShopifyError("Could not reach the Shopify Storefront API.");
  }

  if (response.status === 401 || response.status === 403) {
    throw new ShopifyError("Shopify refused the Storefront token.", response.status);
  }

  let payload: GraphqlResult<T>;
  try {
    payload = (await response.json()) as GraphqlResult<T>;
  } catch {
    throw new ShopifyError("Shopify returned a response that was not JSON.");
  }

  if (!response.ok || !payload.data) {
    throw new ShopifyError(safeGraphqlMessage(payload.errors), response.ok ? 502 : response.status);
  }

  if (payload.errors?.length) {
    const access = payload.errors.some((error) => /access denied/i.test(error.message ?? ""));
    if (access || !payload.data) throw new ShopifyError(safeGraphqlMessage(payload.errors));
  }

  return payload.data;
}

export function storefrontHeaders(buyerIp?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...storefrontAuthHeader(),
  };
  const ip = buyerIp?.trim();
  if (ip && /^[0-9a-fA-F:.]+$/.test(ip)) headers["Shopify-Storefront-Buyer-IP"] = ip;
  return headers;
}

export function buyerIpFrom(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || undefined;
}

export async function withStorefrontFallback<T>(
  run: (flags: { inventory: boolean; metafields: boolean }) => Promise<T>,
  metafields: boolean,
) {
  const attempts: { inventory: boolean; metafields: boolean }[] = [
    { inventory: true, metafields },
    { inventory: true, metafields: false },
    { inventory: false, metafields: false },
  ];
  const seen = new Set<string>();
  let last: unknown;
  for (const flags of attempts) {
    const key = `${flags.inventory}:${flags.metafields}`;
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      return await run(flags);
    } catch (error) {
      last = error;
      if (!(error instanceof ShopifyError)) throw error;
      if (error.status === 401 || error.status === 403 || !/access denied/i.test(error.message)) throw error;
    }
  }
  throw last;
}

function safeGraphqlMessage(errors: GraphqlError[] | undefined) {
  const text = (errors ?? [])
    .map((error) => error.message?.trim() ?? "")
    .filter((message) => message && !/token|secret|shpat_|shpss_/i.test(message))
    .slice(0, 3)
    .join(" ");
  return text || "Shopify Storefront request failed.";
}

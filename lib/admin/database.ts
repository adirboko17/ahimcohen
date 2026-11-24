import "server-only";

export function adminDatabase() {
  const url = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url && !key) return null;
  if (!url || !key) throw new Error("Incomplete Supabase configuration");
  const base = new URL(url);
  if (base.protocol !== "https:" && !(base.protocol === "http:" && ["localhost", "127.0.0.1"].includes(base.hostname))) {
    throw new Error("Invalid Supabase URL");
  }
  return { base, key };
}

export async function adminRequest(path: string, init: RequestInit = {}, params?: Record<string, string>) {
  const db = adminDatabase();
  if (!db) throw new Error("Admin database is not configured");
  const url = new URL(path, db.base);
  if (params) url.search = new URLSearchParams(params).toString();
  const headers = new Headers(init.headers);
  headers.set("apikey", db.key);
  if (db.key.startsWith("eyJ")) headers.set("Authorization", `Bearer ${db.key}`);
  if (typeof init.body === "string") headers.set("Content-Type", "application/json");
  const response = await fetch(url, { ...init, headers, cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Supabase admin request failed (${response.status})`);
  return response;
}

import "server-only";

export function adminRequestOrigin(request: Request) {
  const value = request.headers.get("origin");
  if (!value || !URL.canParse(value)) return null;
  const origin = new URL(value);
  if (origin.origin !== value || (origin.protocol !== "https:" && origin.protocol !== "http:")
    || origin.host !== request.headers.get("host")) return null;
  return origin;
}

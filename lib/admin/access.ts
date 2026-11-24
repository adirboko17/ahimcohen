import "server-only";
import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies, headers } from "next/headers";
import { shopDomain } from "@/lib/shopify/config";
import { adminDatabase, adminRequest } from "./database";

type Credentials = { email: string; salt: string; hash: string; secret: string };
const derive = promisify(scrypt);
const cookieName = "ahim_admin";
const duration = 8 * 60 * 60;
const accountPath = "/rest/v1/ahim_admin_accounts";

async function credentials(): Promise<Credentials | null> {
  if (!adminDatabase()) return null;
  const response = await adminRequest(accountPath, {}, { shop_domain: "eq." + shopDomain(), select: "email,salt,hash,secret" });
  const [account] = await response.json() as Credentials[];
  return account ?? null;
}

function sign(value: string, secret: string) {
  return createHmac("sha256", Buffer.from(secret, "hex")).update(value).digest();
}

export async function isAdmin() {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token || !/^\d+\.[\da-f]{32}\.[\da-f]{64}$/.test(token)) return false;
  const [end, nonce, signature] = token.split(".");
  if (Number(end) <= Date.now()) return false;
  const account = await credentials();
  return Boolean(account && timingSafeEqual(sign(`${end}.${nonce}`, account.secret), Buffer.from(signature, "hex")));
}

export async function signInAdmin(email: string, password: string) {
  const account = await credentials();
  if (!account) return "missing";
  const shop = shopDomain();
  const attempt = await adminRequest("/rest/v1/rpc/ahim_admin_login_attempt", { method: "POST", body: JSON.stringify({ shop }) });
  if (!(await attempt.json())) return "locked";
  if (email.length > 254 || password.length > 256) return "invalid";
  const candidate = await derive(password, Buffer.from(account.salt, "hex"), 64) as Buffer;
  if (!timingSafeEqual(candidate, Buffer.from(account.hash, "hex")) || email.trim().toLowerCase() !== account.email) {
    return "invalid";
  }
  await adminRequest(accountPath, { method: "PATCH", body: JSON.stringify({ attempts: 0 }) }, { shop_domain: "eq." + shop });
  const payload = `${Date.now() + duration * 1000}.${randomBytes(16).toString("hex")}`;
  const secure = (await headers()).get("x-forwarded-proto") === "https";
  (await cookies()).set(cookieName, `${payload}.${sign(payload, account.secret).toString("hex")}`, {
    httpOnly: true, sameSite: "strict", secure, maxAge: duration, path: "/admin",
  });
  return "";
}

export async function signOutAdmin() {
  (await cookies()).set(cookieName, "", { httpOnly: true, sameSite: "strict", path: "/admin", maxAge: 0 });
}

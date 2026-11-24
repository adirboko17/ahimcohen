import "server-only";
import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { cookies, headers } from "next/headers";
import { adminDirectory } from "./storage";

type Credentials = { email: string; salt: string; hash: string; secret: string };
const derive = promisify(scrypt);
const cookieName = "ahim_admin";
const duration = 8 * 60 * 60;
let failures = 0;
let unlockAt = 0;

async function credentials(): Promise<Credentials | null> {
  try {
    const value = JSON.parse(await readFile(join(adminDirectory, "credentials.json"), "utf8")) as Credentials;
    return typeof value.email === "string" && /^[\da-f]{32}$/.test(value.salt)
      && /^[\da-f]{128}$/.test(value.hash) && /^[\da-f]{64}$/.test(value.secret) ? value : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
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
  if (Date.now() >= unlockAt) { failures = 0; unlockAt = Date.now() + 10 * 60 * 1000; }
  if (failures >= 8) return "locked";
  failures += 1;
  const account = await credentials();
  if (!account) return "missing";
  if (email.length > 254 || password.length > 256) return "invalid";
  const candidate = await derive(password, Buffer.from(account.salt, "hex"), 64) as Buffer;
  if (!timingSafeEqual(candidate, Buffer.from(account.hash, "hex")) || email.trim().toLowerCase() !== account.email) {
    return "invalid";
  }
  failures = 0;
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

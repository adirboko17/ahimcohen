import "server-only";
import { createHash } from "node:crypto";
import { shopDomain } from "@/lib/shopify/config";
import { shopFilter, supplierRequest } from "./storage";

export async function registerCloudWorker() {
  if (process.env.VERCEL_ENV !== "production") return;
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (!host || !/^[a-z0-9.-]+$/i.test(host)) throw new Error("חסרה כתובת הפריסה הקבועה של Vercel.");
  await supplierRequest("ahim_supplier_runners","POST",{on_conflict:"shop_domain"},
    {shop_domain:shopDomain(),endpoint:`https://${host}/api/supplier-worker`});
}
export async function claimWakeToken(header: string | null) {
  const match = /^Bearer ([0-9a-f-]{36})$/.exec(header || "");
  if (!match) return false;
  const digest = createHash("sha256").update(match[1]).digest("hex");
  const rows = await supplierRequest("ahim_supplier_runners","PATCH",{
    ...shopFilter(), token_hash:"eq."+digest, expires_at:"gt."+new Date().toISOString(), select:"shop_domain"
  },{token_hash:null,expires_at:null});
  return rows.length === 1;
}

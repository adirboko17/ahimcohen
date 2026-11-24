"use server";

import { getAccountPreview } from "@/lib/account-preview";

export async function verifyAccountPreview(phone: string, code: string) {
  const preview = getAccountPreview();
  return preview !== null && preview.phone === phone && preview.code === code;
}

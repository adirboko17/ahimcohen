"use server";

import { submitCustomerReview } from "@/lib/admin/reviews";
import type { AdminSaveResult } from "@/lib/admin/models";

export async function submitProductReview(productId: string, _previous: AdminSaveResult | null, data: FormData) {
  if (typeof productId !== "string" || !productId || productId.length > 512) return { ok: false, message: "המוצר כבר אינו זמין." };
  if (!(data instanceof FormData)) return { ok: false, message: "טופס הביקורת אינו תקין." };
  return submitCustomerReview(productId, data);
}

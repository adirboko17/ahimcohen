"use server";

import { checkoutStatus } from "@/lib/shopify/checkout-status";

export async function checkShopifyCheckout(receipt: string) {
  return { status: await checkoutStatus(receipt) };
}

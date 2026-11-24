import "server-only";

export function getAccountPreview() {
  if (process.env.NODE_ENV !== "development") return null;
  const phone = process.env.ACCOUNT_PREVIEW_PHONE?.trim() ?? "";
  const code = process.env.ACCOUNT_PREVIEW_OTP?.trim() ?? "";
  return /^05\d{8}$/.test(phone) && /^\d{6}$/.test(code) ? { phone, code } : null;
}

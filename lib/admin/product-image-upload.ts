import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import sharp from "sharp";
import { imageByteLimit, productImageTypes } from "@/lib/product-gallery";
import { stageProductImage } from "@/lib/suppliers/shopify";

export class InvalidProductImage extends Error {}
export const productRequestId = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;

function signature(payload: string) {
  const secret = process.env.SHOPIFY_CLIENT_SECRET?.trim() || process.env.SHOPIFY_ADMIN_API_TOKEN?.trim();
  if (!secret) throw new Error("חיבור החנות להעלאת תמונות אינו מוגדר.");
  return createHmac("sha256", secret).update("manual-product-image:").update(payload).digest();
}

export async function stageManualProductImage(bytes: Buffer, filename: string) {
  let converted: Buffer;
  try {
    converted = await sharp(bytes, { limitInputPixels: 32_000_000 }).rotate()
      .resize({ width: 2400, height: 2600, fit: "inside", withoutEnlargement: true }).webp({ quality: 88 }).toBuffer();
  } catch { throw new InvalidProductImage("לא ניתן לקרוא את התמונה. בחרו קובץ תמונה תקין."); }
  return stageProductImage(new Blob([new Uint8Array(converted)], { type: "image/webp" }), filename);
}

export async function uploadProductImage(file: Blob, requestId: string) {
  if (!productRequestId.test(requestId) || !productImageTypes.includes(file.type) || !file.size || file.size > imageByteLimit)
    throw new InvalidProductImage("בחרו תמונת JPG, PNG או WebP בגודל של עד 4MB.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const hash = createHash("sha256").update(bytes).digest("hex");
  const filename = `ahim-manual-${requestId}-${hash}.webp`;
  const originalSource = await stageManualProductImage(bytes, filename);
  const payload = Buffer.from(JSON.stringify({ requestId, hash, filename, originalSource })).toString("base64url");
  return payload + "." + signature(payload).toString("base64url");
}

export function readProductImageReceipt(value: FormDataEntryValue, requestId: string) {
  if (typeof value === "string" && value.length < 8192) {
    const [payload, mac, extra] = value.split(".");
    if (mac && extra === undefined) {
      const signed = Buffer.from(mac, "base64url");
      const expected = signature(payload);
      if (signed.length === expected.length && timingSafeEqual(signed, expected)) {
        const image = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
          requestId: string; hash: string; filename: string; originalSource: string;
        };
        if (image.requestId === requestId) return image;
      }
    }
  }
  throw new InvalidProductImage("אחת התמונות אינה מקושרת לטופס. נסו לפרסם שוב.");
}

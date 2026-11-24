import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { shopDomain } from "@/lib/shopify/config";
import { adminDatabase, adminRequest } from "./database";

export class InvalidHeroImage extends Error {}
const uploadedName = /^([a-f0-9]{64})-([1-9]\d{0,3})x([1-9]\d{0,3})\.webp$/;
const legacyName = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}\.webp$/;
const objectPath = (name: string) => `ahim-hero-images/${shopDomain()}/${name}`;

export function publicHeroUrl(name: string) {
  if (!uploadedName.test(name) && !legacyName.test(name)) return null;
  const db = adminDatabase();
  return db && new URL("/storage/v1/object/public/" + objectPath(name), db.base);
}

export async function uploadedHero(name: string) {
  const match = uploadedName.exec(name);
  if (!match) throw new InvalidHeroImage("הפניה לתמונה אינה תקינה.");
  await adminRequest("/storage/v1/object/info/authenticated/" + objectPath(name));
  return { src: "/media/hero/" + name, width: Number(match[2]), height: Number(match[3]) };
}

export async function uploadHero(file: File) {
  if (!file.size || file.size > 4 * 1024 * 1024) throw new InvalidHeroImage("גודל כל תמונה מוגבל ל־4MB.");
  const image = sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 32_000_000 });
  let result;
  try {
    const { format } = await image.metadata();
    if (!format || !["jpeg", "png", "webp", "avif", "heif"].includes(format)) throw new Error();
    result = await image.rotate().resize({ width: 2400, height: 2600, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 87 }).toBuffer({ resolveWithObject: true });
  } catch {
    throw new InvalidHeroImage("הקובץ אינו תמונת JPG, PNG, WebP או AVIF תקינה.");
  }
  const { width, height } = result.info;
  const digest = createHash("sha256").update(result.data).digest("hex");
  const filename = `${digest}-${width}x${height}.webp`;
  await adminRequest("/storage/v1/object/" + objectPath(filename), {
    method: "POST", headers: { "Content-Type": "image/webp", "x-upsert": "true", "Cache-Control": "max-age=31536000" },
    body: new Uint8Array(result.data),
  });
  return { filename, src: "/media/hero/" + filename, width, height };
}

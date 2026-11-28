import "server-only";
import { unstable_cache } from "next/cache";
import sharp from "sharp";
import type { ColorFamily } from "../color-families";
import { imageSources } from "../image-sources";
import type { ColorSuggestion } from "./color-review";

function pixelFamily(r: number, g: number, b: number): ColorFamily {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const range = max - min;
  if (max < 55) return "black";
  if (range < 14 || range / max < .15) return max >= 218 ? "white" : "gray";

  const hue = ((max === r ? (g - b) / range : max === g ? 2 + (b - r) / range : 4 + (r - g) / range) * 60 + 360) % 360;
  if (hue < 18 || hue >= 345) return max > 177 && range / max < .53 ? "pink" : "red";
  if (hue < 43) return max < 157 ? "brown" : range / max < .49 ? "beige" : "orange";
  if (hue < 65) return max < 153 || range / max < .42 ? "beige" : "yellow";
  if (hue < 170) return "green";
  if (hue < 256) return "blue";
  if (hue < 306) return "purple";
  return max > 155 ? "pink" : "purple";
}

const paleBackdrop = (r: number, g: number, b: number) =>
  Math.min(r, g, b) >= 222 && Math.max(r, g, b) - Math.min(r, g, b) < 20;

export function colorFromPixels(pixels: Uint8Array, width: number, height: number): ColorSuggestion | undefined {
  let paleEdges = 0;
  let edges = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x > 1 && y > 1 && x < width - 2 && y < height - 2) continue;
      const index = (y * width + x) * 4;
      if (pixels[index + 3] < 160) continue;
      edges++;
      if (paleBackdrop(pixels[index], pixels[index + 1], pixels[index + 2])) paleEdges++;
    }
  }
  const ignoreBackdrop = edges > 0 && paleEdges / edges > .7;
  const samples = new Map<ColorFamily, { count: number; sums: [number, number, number] }>();
  const dx = Math.floor(width * .16);
  const dy = Math.floor(height * .16);
  const area = (width - dx * 2) * (height - dy * 2);
  let foreground = 0;
  for (let y = dy; y < height - dy; y++) {
    for (let x = dx; x < width - dx; x++) {
      const index = (y * width + x) * 4;
      const r = pixels[index], g = pixels[index + 1], b = pixels[index + 2];
      if (pixels[index + 3] < 160 || (ignoreBackdrop && paleBackdrop(r, g, b))) continue;
      const family = pixelFamily(r, g, b);
      const sample = samples.get(family) ?? { count: 0, sums: [0, 0, 0] };
      sample.count++;
      sample.sums[0] += r;
      sample.sums[1] += g;
      sample.sums[2] += b;
      samples.set(family, sample);
      foreground++;
    }
  }
  const winner = [...samples].sort((left, right) => right[1].count - left[1].count)[0];
  if (!winner || foreground < area * .18 || winner[1].count < foreground * .52) return undefined;
  const [family, { count, sums }] = winner;
  const swatch = "#" + sums.map(sum => Math.round(sum / count).toString(16).padStart(2, "0")).join("");
  return { family, swatch, source: "photo" };
}

const readPhotoColor = unstable_cache(async (src: string) => {
  try {
    const response = await fetch(src, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(4000) });
    if (!response.ok || !response.body || !/^image\/(?:jpeg|png|webp|avif)(?:;|$)/i.test(response.headers.get("content-type") ?? "")) return null;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 1024 * 1024) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const { data, info } = await sharp(Buffer.concat(chunks), { limitInputPixels: 12_000_000 })
      .rotate().resize(48, 48, { fit: "inside" }).toColourspace("srgb").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return colorFromPixels(data, info.width, info.height) ?? null;
  } catch {
    return null;
  }
}, ["admin-catalog-color-photo-v1"], { revalidate: 300 });

export async function suggestColorFromPhoto(src: string) {
  if (!URL.canParse(src)) return null;
  const url = new URL(src);
  if (url.protocol !== "https:" || url.port || url.username || url.password) return null;
  const allowed = url.hostname === "cdn.shopify.com" && url.pathname.startsWith("/s/files/") ||
    url.hostname === "ahim-cohen.co.il" && url.pathname.startsWith("/cdn/shop/files/");
  if (!allowed) return null;
  return readPhotoColor(imageSources(url.toString(), 160).src ?? url.toString());
}

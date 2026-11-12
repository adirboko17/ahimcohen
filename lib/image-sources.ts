const WIDTHS = [160, 320, 480, 640, 960, 1280, 1600];

// Let Shopify's CDN resize and negotiate WebP/AVIF directly. Keep the version
// query intact and never rewrite unrelated hosts or signed image URLs.
export function imageSources(src: string | undefined, maxWidth = 960) {
  if (!src) return { src };
  let url: URL;
  try { url = new URL(src); } catch { return { src }; }
  if (url.protocol !== "https:" || !(
    (url.hostname === "cdn.shopify.com" && url.pathname.startsWith("/s/files/")) ||
    (url.hostname === "ahim-cohen.co.il" && url.pathname.startsWith("/cdn/shop/files/"))
  )) return { src };
  if ([...url.searchParams.keys()].some((key) => !["v", "width", "height"].includes(key))) return { src };
  // Preserve the original aspect ratio instead of a previous fixed height crop.
  url.searchParams.delete("height");
  const atWidth = (width: number) => {
    url.searchParams.set("width", String(width));
    return url.toString();
  };
  return {
    src: atWidth(Math.min(640, maxWidth)),
    srcSet: WIDTHS.filter((width) => width <= maxWidth).map((width) => `${atWidth(width)} ${width}w`).join(", "),
  };
}

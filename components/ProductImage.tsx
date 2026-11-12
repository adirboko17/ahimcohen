import type { ImgHTMLAttributes } from "react";
import { imageSources } from "@/lib/image-sources";

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "srcSet"> & { src?: string; maxWidth?: number };

export function ProductImage({ src, alt, maxWidth = 960, sizes = "(max-width: 767px) 50vw, (max-width: 1023px) 33vw, 360px", loading = "lazy", decoding = "async", ...props }: Props) {
  return <img {...imageSources(src, maxWidth)} {...props} alt={alt} sizes={sizes} loading={loading} decoding={decoding} />;
}

import { brandByName } from "@/lib/brands";

/** Use only identified manufacturers, never the multi-brand supplier fallback. */
export function ProductBrand({ name, inline = false }: { name?: string; inline?: boolean }) {
  const brand = brandByName(name);
  if (!brand) return null;

  return (
    <span
      className={`product-brand product-brand-${brand.id}${inline ? " product-brand-inline" : ""}${brand.id === "bicap" || brand.id === "gaoma" ? " product-brand-dark" : ""}`}
      title={brand.name}
    >
      {brand.logo ? (
        <img src={brand.logo} alt={`מותג: ${brand.name}`} width={72} height={26} loading="lazy" decoding="async" />
      ) : <span dir="auto">{brand.name}</span>}
    </span>
  );
}

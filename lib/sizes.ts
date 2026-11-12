import type { Product } from "./catalog";

// Normalize presentation and filters; keep Shopify variant sizes unchanged.
export function sizeLabel(value: string): string {
  let label = value.trim();
  try { label = decodeURIComponent(label); } catch { /* Preserve literal percent signs. */ }
  label = label.normalize("NFKC").replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/[–—־]/g, "-").replace(/\s+/g, " ").trim();
  const key = label.toUpperCase();
  if (!key || key === "DEFAULT TITLE" || key === "מידה") return "";
  if (["OS", "O/S", "OSFA", "ONE SIZE", "ONE SIZE FITS ALL", "מידה אחת"].includes(key)) return "מידה אחת";
  if (key === "LXL") return "L/XL";
  if (key === "ML") return "M/L";
  if (/^(S|M|L)$/.test(key)) return key;
  const repeated = key.match(/^(X+)(S|L)$/);
  if (repeated) return repeated[1].length === 1 ? key : `${repeated[1].length}X${repeated[2]}`;
  const numbered = key.match(/^([1-9]\d*)\s*X\s*([SL])$/);
  if (numbered) return `${Number(numbered[1]) === 1 ? "" : Number(numbered[1])}X${numbered[2]}`;
  // Combined sizes are their own option, never equivalent to either single size.
  if (/^[\dXSLM\s]+\/[\dXSLM\s]+$/i.test(label)) return label.split("/").map(sizeLabel).join("/");
  if (/^\d+(?:\.\d+)?\s*-\s*\d+(?:\.\d+)?$/.test(label)) return label.replace(/\s/g, "");
  return label;
}

function letterRank(label: string): number | undefined {
  if (label === "S") return 0;
  if (label === "M") return 1;
  if (label === "L") return 2;
  const match = label.match(/^(\d*)X([SL])$/);
  if (match) return match[2] === "S" ? -Number(match[1] || 1) : 2 + Number(match[1] || 1);
}

function sortKey(label: string): [number, number, number] {
  if (label === "מידה אחת") return [3, 0, 0];
  const parts = label.split("/").map(letterRank);
  if (parts.every((rank) => rank !== undefined)) return [0, parts[0]!, parts[parts.length - 1]!];
  // Belt measurements retain their label and follow the corresponding letter size.
  const measured = label.match(/^([\dXSLM]+)\s*-\s*(\d+)/i);
  const rank = measured && letterRank(sizeLabel(measured[1]));
  if (rank != null) return [0, rank, Number(measured![2])];
  // Keep manufacturer annotations (e.g. "(xs) 28") without equating sizing systems.
  const numeric = label.replace(/^\([^)]*\)\s*/, "").match(/^(\d+(?:\.\d+)?)(?:-(\d+(?:\.\d+)?))?(?:\s|$)/);
  if (numeric) return [1, Number(numeric[1]), Number(numeric[2] || numeric[1])];
  return [2, 0, 0];
}

export function uniqueSizes(values: readonly string[]): string[] {
  return [...new Set(values.map(sizeLabel).filter(Boolean))].sort((a, b) => {
    const left = sortKey(a), right = sortKey(b);
    for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) return left[i] - right[i];
    return a.localeCompare(b, "he", { numeric: true });
  });
}

export function matchesSizeFilter(productSizes: readonly string[], selectedSizes: readonly string[]): boolean {
  if (!selectedSizes.length) return true;
  const selected = new Set(selectedSizes.map(sizeLabel).filter(Boolean));
  return productSizes.some((size) => selected.has(sizeLabel(size)));
}

export function productSizeOptions(product: Product, color = product.colors[0] || "") {
  // A single display choice can represent different raw size names by color.
  // Resolve it back to the available, original variant before adding to cart.
  const labelOf = (value: string) => sizeLabel(value) || "מידה אחת";
  const labels = uniqueSizes(product.sizes.map(labelOf));
  return labels.map((label) => {
    const choices = product.choices?.filter((choice) =>
      labelOf(choice.size) === label && (!color || choice.color.trim().toLowerCase() === color.trim().toLowerCase()),
    );
    if (product.choices?.length) {
      const choice = choices?.find((variant) => variant.available) ?? choices?.[0];
      return { label, value: choice?.size ?? "", available: !!choice?.available };
    }
    return { label, value: product.sizes.find((raw) => labelOf(raw) === label)!, available: true };
  });
}

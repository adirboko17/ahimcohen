import type { Category, Product, VariantChoice } from "./catalog";

type Snapshot = { categories: Category[]; products: Product[] };
type WireChoice = [id: string, color: number, size: number, price: number, available: boolean, image: number | null, sku: string | null,
  optionsLabel?: number | null, sourceVariantId?: string];
type WireProduct = Omit<Product, "imgs" | "choices"> & { imgs?: number[]; choices?: WireChoice[] };
export type CatalogWire = { categories: Category[]; strings: string[]; products: WireProduct[] };

// Repeated variant photos/colors/sizes are sent once, without dropping details
// needed by search, filters, quick-add, saved carts or product galleries.
export function packCatalog(catalog: Snapshot): CatalogWire {
  const strings: string[] = [];
  const indices = new Map<string, number>();
  const intern = (value: string) => {
    const known = indices.get(value);
    if (known !== undefined) return known;
    const index = strings.length;
    strings.push(value);
    indices.set(value, index);
    return index;
  };
  return {
    categories: catalog.categories,
    strings,
    products: catalog.products.map(({ imgs, choices, ...product }) => ({
      ...product,
      ...(imgs === undefined ? {} : { imgs: imgs.map(intern) }),
      ...(choices === undefined ? {} : { choices: choices.map((choice) => {
        const encoded: WireChoice = [choice.id, intern(choice.color), intern(choice.size), choice.price, choice.available,
          choice.image === undefined ? null : intern(choice.image), choice.sku ?? null];
        if (choice.optionsLabel || choice.sourceVariantId) encoded[7] = choice.optionsLabel ? intern(choice.optionsLabel) : null;
        if (choice.sourceVariantId) encoded[8] = choice.sourceVariantId;
        return encoded;
      }) }),
    })),
  };
}

export function unpackCatalog(catalog: CatalogWire): Snapshot {
  const strings = catalog.strings;
  return {
    categories: catalog.categories,
    products: catalog.products.map(({ imgs, choices, ...product }) => ({
      ...product,
      ...(imgs === undefined ? {} : { imgs: imgs.map((index) => strings[index]) }),
      ...(choices === undefined ? {} : { choices: choices.map(([id, color, size, price, available, image, sku, optionsLabel, sourceVariantId]): VariantChoice => ({
        id, color: strings[color], size: strings[size], price, available,
        ...(image === null ? {} : { image: strings[image] }),
        ...(sku === null ? {} : { sku }),
        ...(optionsLabel == null ? {} : { optionsLabel: strings[optionsLabel] }),
        ...(sourceVariantId && { sourceVariantId }),
      })) }),
    })),
  };
}

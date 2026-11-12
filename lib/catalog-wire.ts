import type { Category, Product, VariantChoice } from "./catalog";

type Snapshot = { categories: Category[]; products: Product[] };
type WireChoice = [id: string, color: number, size: number, price: number, available: boolean, image: number | null, sku: string | null];
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
      ...(choices === undefined ? {} : { choices: choices.map((choice): WireChoice => [
        choice.id, intern(choice.color), intern(choice.size), choice.price, choice.available,
        choice.image === undefined ? null : intern(choice.image), choice.sku ?? null,
      ]) }),
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
      ...(choices === undefined ? {} : { choices: choices.map(([id, color, size, price, available, image, sku]): VariantChoice => ({
        id, color: strings[color], size: strings[size], price, available,
        ...(image === null ? {} : { image: strings[image] }),
        ...(sku === null ? {} : { sku }),
      })) }),
    })),
  };
}

import type { Product } from "./catalog";

export type QuantityOffer = {
  title: string;
  quantity: number;
  total: number;
  unitPrice: number;
  regularTotal: number | null;
  saving: number;
  kind: "pack" | "quantity";
  quantityLabel: "יחידות" | "זוגות";
  unitLabel: "ליחידה" | "לזוג";
};

const wordCounts: Record<string, number> = {
  שתי: 2, שני: 2, שתיים: 2, שניים: 2, שלוש: 3, שלושה: 3,
  ארבע: 4, ארבעה: 4, חמש: 5, חמישה: 5, שש: 6, שישה: 6, עשר: 10, עשרה: 10,
};
const countPattern = `(\\d+|${Object.keys(wordCounts).join("|")})`;
const advertisedPattern = new RegExp(`(?:^|[\\s(\\-])${countPattern}\\s+(?:[^.!?]{1,70}?\\s+)?ב[\\s-]*([\\d][\\d,.]*)\\s*(?:₪|ש["״׳']?ח)`);
const packPattern = new RegExp(`(?:מארז|חבילה|חבילת)\\s+${countPattern}(?:\\s|$)`);
const countOf = (value: string) => wordCounts[value] ?? Number(value);
const moneyOf = (value: string) => Number(/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(value) ? value.replace(/,/g, "") : value.replace(",", "."));

export function offerCartQuantity(product: Product) {
  const offer = quantityOffer(product);
  return offer?.kind === "quantity" ? offer.quantity : 1;
}

function buildOffer(product: Product, quantity: number, total: number, kind: QuantityOffer["kind"], regular: number | undefined, title = product.name): QuantityOffer | null {
  if (!Number.isSafeInteger(quantity) || quantity <= 1 || !Number.isFinite(total) || total <= 0) return null;
  const pairs = /זוגות/.test(product.name.normalize("NFKC"));
  const regularTotal = regular && Number.isFinite(regular) && regular > total ? regular : null;
  return {
    title, quantity, total, unitPrice: total / quantity, regularTotal,
    saving: regularTotal ? regularTotal - total : 0,
    kind, quantityLabel: pairs ? "זוגות" : "יחידות", unitLabel: pairs ? "לזוג" : "ליחידה",
  };
}

export function managedQuantityOffer(product: Product, quantity: number, total: number) {
  const original = quantityOffer(product);
  const regular = original?.kind === "pack" ? original.regularTotal ?? undefined : product.price * quantity;
  return buildOffer(product, quantity, total, "pack", regular, original?.title);
}

export function quantityOffer(product: Product): QuantityOffer | null {
  if (product.quantityOfferHidden) return null;
  const name = product.name.normalize("NFKC").replace(/[–—־]/g, "-").replace(/\s+/g, " ").trim();
  const deal = product.deal;
  if (deal && deal[1] < product.price * deal[0]) {
    const offer = buildOffer(product, deal[0], deal[1], "quantity", product.price * deal[0]);
    if (offer) return offer;
  }
  // Titles can advertise a multi-buy priced per item, or a complete pack whose
  // catalog price already includes all units. Never change cart quantities here.
  const advertised = name.match(advertisedPattern);
  if (advertised) {
    const quantity = countOf(advertised[1]);
    const advertisedTotal = moneyOf(advertised[2]);
    if (!Number.isFinite(advertisedTotal) || advertisedTotal <= 0) return null;
    const isPack = Math.abs(product.price - advertisedTotal) < .005 || /מארז|חביל[הת]/.test(name) || /^\s*חביל[הת]/m.test((product.desc ?? []).join("\n"));
    const title = name.slice(0, advertised.index).trim().replace(/^מבצע\s+|\s+מבצע$/g, "").replace(/[\s:()\-]+$/g, "").trim() || product.name;
    return buildOffer(product, quantity, isPack ? product.price : advertisedTotal, isPack ? "pack" : "quantity", isPack ? product.was : product.price * quantity, title);
  }
  // A discounted multipack uses the current pack price, not count * pack price.
  if (!(product.was && product.was > product.price)) return null;
  const pack = name.match(packPattern) ?? name.match(/(?:^|\s|\()(\d+)\s+(?:זוגות|יחידות|יח['׳״"`]?)(?:\s|\)|$)/);
  return pack ? buildOffer(product, countOf(pack[1]), product.price, "pack", product.was) : null;
}

export function isQuantityOffer(product: Product): boolean {
  return quantityOffer(product) !== null;
}

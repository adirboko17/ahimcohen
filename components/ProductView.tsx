"use client";

import { ProductImage } from "./ProductImage";
import { ProductBrand } from "./ProductBrand";
import { brandByName } from "@/lib/brands";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { FREE_SHIPPING, phOf, swatchColor, colorLabel, type Product } from "@/lib/catalog";
import { useCatalog } from "@/lib/catalog-context";
import { uniqueColors } from "@/lib/colors";
import { offerCartQuantity, quantityOffer } from "@/lib/quantity-offers";
import { useCartQuote } from "@/lib/use-cart-quote";
import { fmt, priceFor, saleBadge } from "@/lib/pricing";
import { complementaryAccessories, similarProducts } from "@/lib/product-recommendations";
import { productColorIndex, productGalleryImages } from "@/lib/product-selection";
import { productSizeOptions, sizeLabel } from "@/lib/sizes";
import { useStore } from "@/lib/store";
import { IconCheck, IconFwd, IconPackages, IconPhone, IconPin, IconTruck } from "./icons";
import { ProductTile } from "./ProductTile";
import { ProductReviews, ProductReviewsLink, reviewSummary, type ReviewInteraction } from "./ProductReviews";
import { QuantityUnitPicker } from "./QuantityUnitPicker";
import { quantitySelection, type QuantityUnit } from "@/lib/quantity-selection";
import type { AddItem, PackUnit } from "@/lib/types";
import type { PublishedBundle, PublishedReview } from "@/lib/admin/models";

function bundleOf(p: Product, extras: Product[], q: number): [string, number][] {
  const rest = extras.filter((item) => item.id !== p.id).slice(0, 2).map((item) => [item.id, 1] as [string, number]);
  return [[p.id, q], ...rest];
}

type ProductViewProps = { id: string; initialColor?: string; initialSize?: string; initialBundle?: string; fromQuantityOffer?: boolean; bundles?: PublishedBundle[]; reviews?: PublishedReview[] };

export function ProductView(props: ProductViewProps) {
  return <ProductDetails key={JSON.stringify([props.id, props.initialColor, props.initialSize, props.initialBundle, props.fromQuantityOffer])} {...props} />;
}

function ProductDetails({ id, initialColor, initialSize, initialBundle, fromQuantityOffer = false, bundles = [], reviews = [] }: ProductViewProps) {
  const { product, category, products } = useCatalog();
  const base = product(id);
  const [reviewInteraction, setReviewInteraction] = useState<ReviewInteraction>(null);
  const [managedId, setManagedId] = useState(() => bundles.find((bundle) => bundle.cartProductId && bundle.id === initialBundle)?.id);
  const managed = managedId ? bundles.find((bundle) => bundle.id === managedId) : undefined;
  const packProduct = managed?.cartProductId ? product(managed.cartProductId) : undefined;
  const p = packProduct ?? base;
  const accP = useMemo(() => base ? complementaryAccessories(base, products) : [], [base, products]);
  const related = useMemo(() => base ? similarProducts(base, products.filter((item) => !accP.some((accessory) => accessory.id === item.id))) : [], [base, products, accP]);
  const router = useRouter();
  const { addMany, flash, toastOn, cart } = useStore();
  const [color, setColor] = useState(() => {
    if (!p) return 0;
    const requested = productColorIndex(p, initialColor, initialSize);
    if (!p.bundleSourceId || p.choices?.some((choice) => choice.available && choice.color === (p.colors[requested] || ""))) return requested;
    return Math.max(0, p.colors.indexOf(p.choices?.find((choice) => choice.available)?.color ?? ""));
  });
  const sizeOptions = useMemo(() => p ? productSizeOptions(p, p.colors[color] || "") : [], [p, color]);
  const [selectedSize, setSize] = useState<string | null>(() => {
    if (initialSize) return sizeOptions.find((option) => option.available && option.label === sizeLabel(initialSize))?.label ?? null;
    return sizeOptions.length === 1 && sizeOptions[0].available ? sizeOptions[0].label : null;
  });
  const selectedOption = sizeOptions.find((option) => option.label === selectedSize && option.available);
  const size = selectedOption?.label ?? null;
  const [qty, setQty] = useState(() => bundles.find((bundle) => !bundle.productId && !bundle.cartProductId && bundle.id === initialBundle)?.quantity
    ?? (base && !packProduct && fromQuantityOffer ? offerCartQuantity(base) : 1));
  const baseOffer = base ? quantityOffer(base) : null;
  const offer = packProduct ? null : baseOffer;
  const hasPackages = bundles.some((bundle) => !bundle.productId && !bundle.cartProductId) || baseOffer?.kind === "quantity" || !!base?.deal;
  const mixedOffer = !!(packProduct && managed?.mixedUnits);
  const separateUnits = mixedOffer || !packProduct && hasPackages && qty > 1;
  const selectionProduct = mixedOffer ? base : p;
  const unitCount = mixedOffer ? managed!.quantity : qty;
  const [unitSelections, setUnitSelections] = useState<Record<number, QuantityUnit>>({});
  const unitPicker = useRef<HTMLDivElement>(null);
  const units = useMemo(() => selectionProduct && separateUnits ? quantitySelection(selectionProduct, Array.from({ length: unitCount }, (_, index) =>
    unitSelections[index] ?? { color, size: selectedSize },
  )) : null, [selectionProduct, separateUnits, unitCount, unitSelections, color, selectedSize]);
  const packUnits: PackUnit[] | undefined = mixedOffer && units?.complete
    ? units.quoteLines.flatMap((row) => row.variantId ? [{ variantId: row.variantId, quantity: row.qty }] : [])
      .sort((a, b) => a.variantId.localeCompare(b.variantId)) : undefined;
  const anchor = packUnits?.length ? base?.choices?.find((choice) => choice.id === packUnits[0].variantId) : undefined;
  const mixedVariant = anchor && packProduct?.choices?.find((choice) => choice.available && choice.color === anchor.color && choice.size === anchor.size);
  const selectionReady = mixedOffer ? !!mixedVariant && !!units?.complete : separateUnits ? !!units?.complete : !!selectedOption;
  const variant = p?.choices?.find((choice) => choice.available && choice.color === (p.colors[color] || "") && (!selectedOption || choice.size === selectedOption.value));
  const quoteState = useCartQuote(mixedOffer
    ? packProduct && mixedVariant && packUnits ? [{ pid: packProduct.id, color: mixedVariant.color, size: mixedVariant.size, qty, variantId: mixedVariant.id, packUnits }] : []
    : separateUnits ? units?.quoteLines ?? [] : p && offer?.kind === "quantity" && variant ? [{ pid: p.id, color: variant.color, size: variant.size, qty, variantId: variant.id }] : []);
  const [sizeErr, setSizeErr] = useState(false);
  const [acc, setAcc] = useState<string | null>(() => p?.desc ? "desc" : "spec");
  const [gal, setGal] = useState(0);
  const mobileGallery = useRef<HTMLDivElement>(null);
  const [bOff, setBOff] = useState<Record<string, boolean>>({});
  const [bSize, setBSize] = useState<Record<string, string>>({});
  const [bErr, setBErr] = useState(false);

  if (!p || !base) return null;
  const ratings = reviewSummary(reviews);
  const sizeLabels = sizeOptions.map((option) => option.label);
  const catName = category(p.cat)?.name || "";
  const imgs = productGalleryImages(p, p.colors[color] || "");
  const slides: { kind: "img" | "ph" | "spec"; src?: string; text?: string; rows?: { k: string; v: string }[] }[] = imgs.map((src) => ({ kind: "img", src }));
  if (!imgs.length) slides.push({ kind: "ph", text: p.std ? p.std.join(" · ") : p.sku || catName });
  const specRows = (p.specs || []).map(([k, v]) => ({ k, v }));
  if (specRows.length) slides.push({ kind: "spec", rows: specRows });
  else if (p.std) slides.push({ kind: "spec", rows: [{ k: "תקן", v: p.std.join(" · ") }, { k: "צבע", v: uniqueColors(p.colors).join(", ") }, { k: "מידות", v: sizeLabels.join(", ") }] });
  const gi = Math.min(gal, slides.length - 1);
  const current = slides[gi];

  const inCart = cart.filter((l) => l.pid === p.id).reduce((a, l) => a + l.qty, 0);
  const deal: [number, number] | undefined = baseOffer?.kind === "quantity" ? [baseOffer.quantity, baseOffer.total] : base.deal;
  const unitPrice = variant?.price ?? p.price;
  const baseUnitPrice = packProduct
    ? (base.choices?.find((choice) => choice.color === base.colors[color] && choice.size === selectedOption?.value)?.price ?? base.price)
    : unitPrice;
  const bundledQuantities = new Map<number, PublishedBundle>();
  for (const bundle of bundles) if (!bundle.productId && !bundle.cartProductId && !bundledQuantities.has(bundle.quantity)) bundledQuantities.set(bundle.quantity, bundle);
  const options = [...bundledQuantities.values()];
  if (deal && !bundledQuantities.has(deal[0])) options.push({ id: "catalog", name: `חבילת ${deal[0]}`, quantity: deal[0], total: deal[1] });
  options.sort((a, b) => a.quantity - b.quantity);
  const selectedPack = !packProduct ? options.find((pack) => pack.quantity === qty) : undefined;
  const galleryOffer = packProduct ? managed : selectedPack ?? options[0];
  const galleryDeal: [number, number] | undefined = galleryOffer && [galleryOffer.quantity, galleryOffer.total];
  const packs = [...options, ...bundles.filter((bundle) => bundle.productId || bundle.cartProductId)].sort((a, b) => a.quantity - b.quantity);
  packs.unshift({ id: "single", name: "יחידה אחת", quantity: 1, total: baseUnitPrice });
  const line = quoteState.quote?.total ?? selectedPack?.total ?? (qty === 1 || offer?.kind === "pack" ? qty * unitPrice : priceFor(p, qty));
  const lineLabel = separateUnits && !selectionReady ? "בחרו מידה לכל יחידה" : quoteState.pending ? "מחשב מחיר…" : quoteState.error ? "המחיר יתעדכן בסל" : fmt(line);
  const feedback = quoteState.pending ? "מעדכנים את המחיר…" : quoteState.error ? quoteState.error
    : quoteState.quote ? `${qty} ${offer?.kind === "pack" ? "מארזים" : "יחידות"} ב־${fmt(line)}${quoteState.quote.savings > 0 ? ` · חסכתם ${fmt(quoteState.quote.savings)}` : ""}`
    : selectedPack ? `מבצע ${qty} יחידות ב־${fmt(selectedPack.total)}` : "";

  const accs = [
    ...(p.desc ? [{ id: "desc", title: "תיאור", lines: p.desc.map((v) => ({ k: "", v: "- " + v })) }] : []),
    {
      id: "spec",
      title: "מפרט",
      lines: [
        ...(p.sku ? [{ k: "מק״ט", v: p.sku }] : []),
        ...(p.brand ? [{ k: "מותג", v: p.brand }] : []),
        { k: "קטגוריה", v: catName },
        ...(p.specs || []).map(([k, v]) => ({ k, v })),
        ...(p.std ? [{ k: "תקן", v: p.std.join(" · ") }] : []),
        { k: "מידות", v: sizeLabels.join(", ") },
      ],
    },
    {
      id: "ship",
      title: "משלוחים והחזרות",
      lines: [
        { k: "", v: `משלוח חינם בהזמנות מעל ${fmt(FREE_SHIPPING)}.` },
        { k: "", v: "אפשר לאסוף מהסניף בהפועלים 20, באר שבע." },
        { k: "", v: "מדיניות ההחזרות המלאה מפורטת בתקנון האתר." },
      ],
    },
  ];

  const items = bundleOf(p, accP, qty);
  const mainItems: AddItem[] = mixedOffer ? mixedVariant && packUnits ? [[p.id, Math.max(0, p.colors.indexOf(mixedVariant.color)), mixedVariant.size, qty, packUnits]] : []
    : separateUnits ? units?.items ?? [] : selectedOption ? [[p.id, color, selectedOption.value, qty]] : [];
  const requireSelection = () => {
    setSizeErr(true);
    flash(separateUnits ? "בחרו צבע ומידה לכל יחידה" : "בחרו מידה");
    unitPicker.current?.querySelector<HTMLSelectElement>('select[data-missing="true"]')?.focus();
  };
  const add = () => {
    if (!selectionReady) {
      requireSelection();
      return;
    }
    addMany(mainItems, true);
  };
  const addBundle = () => {
    const sel = bRows.flatMap((row) => row?.on ? [row] : []);
    const miss = sel.some((row) => !row.isMain && !row.option?.available);
    if (!selectionReady || miss) {
      setBErr(miss);
      if (!selectionReady) requireSelection();
      else flash("בחרו מידה לכל פריט");
      return;
    }
    setBErr(false);
    addMany(
      sel.flatMap((row): AddItem[] => row.isMain
        ? mainItems
        : [[row.item.id, 0, row.option!.value, row.q]]),
      true
    );
  };

  let bTotal = 0;
  let bRegular = 0;
  let bCount = 0;
  const bRows = items.map(([pid, q]) => {
    const item = product(pid);
    if (!item) return null;
    const isMain = pid === p.id;
    const on = isMain || !bOff[pid];
    const options = productSizeOptions(item);
    const multi = options.length > 1;
    const chosen = multi ? bSize[pid] || "" : options[0]?.label || "";
    const option = options.find((entry) => entry.label === chosen && entry.available);
    const pr = isMain ? line : priceFor(item, q);
    if (on) {
      bTotal += pr;
      bRegular += q * item.price;
      bCount += q;
    }
    return { item, q, isMain, on, multi, chosen, option, options, pr };
  });

  const addBg = toastOn ? "#1F7A3D" : "#111";
  const inStock = separateUnits ? !!units?.complete : sizeOptions.some(option => option.available);
  const stockMessage = separateUnits && !selectionReady ? "בחרו צבע ומידה לכל יחידה לבדיקת זמינות"
    : inStock ? "המוצר הזה זמין במלאי" : "המוצר אינו זמין במלאי בצבע שנבחר";

  return (
    <main className="wrap product-page">
      <div className="crumbs desk">
        <Link href="/">בית</Link>
        <span>/</span>
        <Link href={`/c/${p.cat}`}>{catName}</Link>
        <span>/</span>
        <span className="now">{p.name}</span>
      </div>
      <div className="pdp">
        <div className="gallery desk">
          <div className="g-side">
            {slides.map((sl, i) => (
              <button key={i} className={`g-thumb ${i === gi ? "on" : ""}`} onClick={() => setGal(i)} aria-label="תמונה">
                {sl.kind === "img" && <ProductImage src={sl.src} sizes="80px" maxWidth={320} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", mixBlendMode: "multiply" }} />}
                {sl.kind !== "img" && <span className="k" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, color: "#8a8a86" }}>{sl.kind === "spec" ? "מפרט" : sl.text}</span>}
              </button>
            ))}
          </div>
          <GalleryFrame slide={current} name={p.name} deal={galleryDeal} was={p.was} price={p.price} />
        </div>
        <div className="mob-block" style={{ position: "relative" }}>
          <div
            key={color}
            ref={mobileGallery}
            className="m-gal scroller"
            onScroll={(e) => {
              const el = e.currentTarget;
              const i = Math.round(Math.abs(el.scrollLeft) / el.clientWidth);
              if (i !== gal) setGal(i);
            }}
          >
            {slides.map((sl, i) => (
              <div className="m-slide" key={i}>
                {sl.kind === "img" && <ProductImage src={sl.src} sizes="(max-width: 767px) 100vw, 50vw" maxWidth={1280} loading={i === 0 ? "eager" : "lazy"} fetchPriority={i === 0 ? "high" : "auto"} alt={p.name} />}
                {sl.kind === "ph" && <span className="k ph-xl" style={{ fontSize: 96 }}>{sl.text}</span>}
                {sl.kind === "spec" && (
                  <div className="spec-slide" style={{ padding: 24 }}>
                    <span className="k" style={{ fontSize: 60 }}>מפרט</span>
                    {sl.rows?.map((r) => (
                      <div className="spec-row" key={r.k} style={{ fontSize: 15 }}>
                        <span style={{ color: "#bdbdb7" }}>{r.k}</span>
                        <span style={{ fontWeight: 700 }}>{r.v}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="dots">
            {slides.map((_, i) => (
              <i key={i} style={{ width: i === gal ? 20 : 8, opacity: i === gal ? 1 : 0.25 }} />
            ))}
          </div>
          {galleryDeal && <span className="badge y" style={{ position: "absolute", top: 12, right: 12 }}>{galleryDeal[0]} ב-{galleryDeal[1]} ₪</span>}
          <button className="back-fab" aria-label="חזרה" onClick={() => (window.history.length > 1 ? router.back() : router.push(`/c/${p.cat}`))}>
            →
          </button>
        </div>

        <div className="buy">
          <div className="buy-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14, fontWeight: 600 }} className="muted">
              {brandByName(p.brand) ? <ProductBrand name={p.brand} inline /> : <span>{p.brand || "האחים כהן"}</span>}
              <span dir="ltr">{p.sku ? `מק״ט ${p.sku}` : ""}</span>
            </div>
            {p.promoLabel && <span className="badge y product-promo-label">{p.promoLabel}</span>}
            <h1>{p.name}</h1>
            <ProductReviewsLink summary={ratings} interaction={reviewInteraction} onReviewInteraction={setReviewInteraction} />
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 28, fontWeight: 800 }} aria-live="polite">{selectedPack || managed?.quantityOffer ? fmt(line) : offer || hasPackages ? lineLabel : fmt(unitPrice)}</span>
              {offer || hasPackages ? quoteState.quote && quoteState.quote.savings > 0 && <s style={{ fontSize: 18, color: "#8a8a86" }}>{fmt(quoteState.quote.regular)}</s> : p.was && <s style={{ fontSize: 18, color: "#8a8a86" }}>{fmt(p.was)}</s>}
            </div>
            {offer && <span className="muted" style={{ fontSize: 14 }}>מחיר כולל {offer.kind === "pack" && qty === 1 ? "למארז אחד" : `ל־${qty} ${offer.kind === "pack" ? "מארזים" : "יחידות"}`}{quoteState.quote || offer.kind === "pack" ? ` · ${fmt(line / (qty * (offer.kind === "pack" ? offer.quantity : 1)))} ${offer.unitLabel}` : ""}</span>}
            {!offer && selectedPack && <span className="muted" style={{ fontSize: 14 }}>מחיר כולל ל־{qty} יחידות</span>}
            {p.std && (
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {p.std.map((t) => (
                  <span key={t} className="badge b">{t}</span>
                ))}
              </div>
            )}
          </div>

          {managed && packProduct && <div className="buy-pad product-pack-feedback">{managed.quantity} יחידות בכל מארז</div>}

          {packs.length > 1 && !managed?.quantityOffer && (
            <div className="buy-pad product-pack-options" role="group" aria-label="בחרו חבילה">
              <strong className="product-pack-heading">בחרו חבילה</strong>
              {packs.map(({ id: optionId, name, quantity, total, productId, cartProductId, bestValue }) => {
                const regular = baseUnitPrice * quantity;
                const saving = Math.round((regular - total) * 100) / 100;
                const detail = <>
                  <span className="product-pack-copy">
                    <strong>
                      <bdi>{name}</bdi>
                      {bestValue ? <span className="badge product-pack-best-value">הכי משתלם</span>
                        : !productId && !cartProductId && saving > 0 && <span className="badge y">מבצע</span>}
                    </strong>
                    <small className="muted"><bdi>{fmt(total / quantity)}</bdi> ליחידה{saving > 0 && <> · חיסכון <bdi>{fmt(saving)}</bdi></>}</small>
                  </span>
                  <span className="product-pack-price">
                    <strong><bdi>{fmt(total)}</bdi></strong>
                    {saving > 0 && <s><bdi>{fmt(regular)}</bdi></s>}
                  </span>
                </>;
                const checked = cartProductId ? !!packProduct && managed?.id === optionId : !packProduct && qty === quantity;
                return productId ? <Link key={optionId} className="pack pack-product" href={`/p/${encodeURIComponent(productId)}`}>
                  <span className="pack-product-arrow" aria-hidden="true"><IconFwd /></span>{detail}
                </Link> : <label key={optionId} className={`pack${checked ? " on" : ""}`}>
                  <input type="radio" name={`package-${id}`} value={cartProductId ? optionId : quantity} checked={checked} onChange={() => {
                    setManagedId(cartProductId ? optionId : undefined);
                    setQty(cartProductId ? 1 : quantity);
                    setSizeErr(false);
                    if (cartProductId) {
                      const pack = product(cartProductId);
                      if (!pack) return;
                      const current = pack.colors[color] || "";
                      const preferred = pack.choices?.find((choice) => choice.available && choice.color === current) ?? pack.choices?.find((choice) => choice.available);
                      const nextColor = Math.max(0, pack.colors.indexOf(preferred?.color ?? ""));
                      const sizes = productSizeOptions(pack, pack.colors[nextColor] || "").filter((option) => option.available);
                      setColor(nextColor);
                      setSize(sizes.find((option) => option.label === selectedSize)?.label ?? (sizes.length === 1 ? sizes[0].label : null));
                      setGal(0);
                    }
                  }} />
                  <span className="radio" aria-hidden="true"><i /></span>{detail}
                </label>;
              })}
              {feedback && <strong className="product-pack-feedback">{feedback}</strong>}
            </div>
          )}

          {offer?.kind === "pack" && <div className="buy-pad">
            <div className="product-pack-note">
              <span className="product-pack-note-icon"><IconPackages /></span>
              <div><strong>{offer.quantity} {offer.quantityLabel} בכל מארז</strong><p>בחירת הכמות מתייחסת למספר המארזים, ולא ליחידות בודדות.</p></div>
            </div>
          </div>}
          {quoteState.error && <button type="button" className="cart-edit-link" onClick={quoteState.retry}>עדכון המחיר</button>}

          {separateUnits && units && selectionProduct && <div ref={unitPicker}>
            <QuantityUnitPicker product={selectionProduct} rows={units.rows} showErrors={sizeErr} onChange={(index, selection) => {
              setUnitSelections((previous) => ({ ...previous, ...Object.fromEntries(units.rows.map((row, rowIndex) => [rowIndex, row.selection])), [index]: selection }));
              setSizeErr(false);
              setColor(selection.color);
              setGal(0);
            }} />
          </div>}

          {!separateUnits && p.colors.length > 0 && (
            <div className="buy-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 15 }}>
                <b>צבע: </b>
                {colorLabel(p.colors[color] ?? "")}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {p.colors.map((c, i) => (
                  <button key={c} className={`color-dot lg ${i === color ? "on" : "off"}`} style={{ background: swatchColor(c) }} title={colorLabel(c)} aria-label={colorLabel(c)} aria-pressed={i === color}
                    disabled={!!packProduct && !p.choices?.some((choice) => choice.available && choice.color === c)} onClick={() => {
                    setColor(i);
                    setGal(0);
                    mobileGallery.current?.scrollTo({ left: 0, behavior: "instant" });
                  }} />
                ))}
              </div>
            </div>
          )}

          {!separateUnits && <div className="buy-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 15 }}>
              <span>
                <b>מידה: </b>
                {size || "לא נבחרה"}
              </span>
            </div>
            <div className="size-grid">
              {sizeOptions.map(({ label, available }) => {
                const shoeSize = label.match(/^(AU\s*\d+(?:\.\d+)?)\s*\/\s*(EU\s*\d+(?:\.\d+)?)$/i);
                return (
                  <button type="button" key={label} disabled={!available} aria-label={label} aria-pressed={size === label} title={!available ? "המידה אינה זמינה בצבע שנבחר" : undefined} className={`size ${size === label ? "on" : ""} ${sizeErr && available && size !== label ? "err" : ""}`} onClick={() => { setSize(label); setSizeErr(false); }}>
                    {shoeSize ? <><span className="size-system">{shoeSize[1]}</span><span className="size-system">{shoeSize[2]}</span></> : label}
                  </button>
                );
              })}
            </div>
            {sizeErr && <span className="err">יש לבחור מידה לפני ההוספה לסל</span>}
          </div>}

          <div className="add-row buy-pad">
            <div className="qty">
              <button disabled={qty >= 250} onClick={() => setQty((n) => Math.min(250, n + 1))} aria-label="הוספת יחידה">+</button>
              <span>{qty}</span>
              <button disabled={qty <= 1} onClick={() => setQty((n) => Math.max(1, n - 1))} aria-label="הפחתת יחידה">−</button>
            </div>
            <button className="btn product-add-btn" disabled={!separateUnits && !inStock} style={{ background: `var(--product-add-background, ${addBg})` }} onClick={add}>
              <span>{!separateUnits && !inStock ? "אזל מהמלאי" : selectionReady ? "הוספה לסל" : separateUnits ? "בחרו מידה לכל יחידה" : "בחרו מידה"}</span>
              <span className="product-add-price"><span className="desk">· </span>{lineLabel}</span>
            </button>
          </div>
          <div className={`stock product-stock buy-pad${inStock ? "" : " is-unavailable"}`} role="status">
            <span className="sq" style={{ background: "currentColor" }} aria-hidden="true" />
            {stockMessage}{inStock && inCart ? ` · ${inCart} כבר בסל` : ""}
          </div>

          {accP.length > 0 && <div className="bundle" style={{ marginInline: undefined }}>
            <div className="bundle-h">
              <span style={{ fontSize: 16, fontWeight: 800 }}>השלימו את הסט</span>
              {bRegular - bTotal > 0 && <span className="save-tag y">חיסכון {fmt(bRegular - bTotal)}</span>}
            </div>
            {bRows.map((r) => {
              if (!r) return null;
              const image = r.isMain ? imgs[0] : r.item.imgs?.[0];
              return (
              <div key={r.item.id} className="bundle-row" style={{ opacity: r.on ? 1 : 0.45 }}>
                <button className={`tick ${r.on ? "on" : ""}`} aria-label="בחירה" onClick={() => { if (!r.isMain) setBOff((s) => ({ ...s, [r.item.id]: !s[r.item.id] })); }}>
                  {r.on && <IconCheck />}
                </button>
                <div className="mini-ph">
                  {image ? <ProductImage src={image} sizes="100px" maxWidth={320} alt="" /> : <span className="k" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, color: "#bdbdb7" }}>{phOf(r.item)}</span>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                  <ProductBrand name={r.item.brand} inline />
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{r.item.name}</span>
                    <span style={{ fontSize: 15, fontWeight: 800 }}>{r.isMain ? lineLabel : fmt(r.pr)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                    <span className="muted" style={{ fontSize: 13 }}>{r.q > 1 ? `${r.q} יחידות${r.item.deal && r.q >= r.item.deal[0] ? " · מבצע כמות" : ""}` : "יחידה אחת"}</span>
                    {!r.isMain && r.multi && (
                      <select className="plain" style={{ height: 34, minWidth: 84, border: 0, boxShadow: `inset 0 0 0 1px ${bErr && r.on && !r.chosen ? "#B3261E" : "#CFCFCA"}` }} value={r.chosen} onChange={(e) => { setBSize((s) => ({ ...s, [r.item.id]: e.target.value })); setBErr(false); }}>
                        <option value="">מידה</option>
                        {r.options.map((option) => <option key={option.label} value={option.label} disabled={!option.available}>{option.label}</option>)}
                      </select>
                    )}
                    {r.isMain && <span style={{ fontSize: 13, fontWeight: 700 }}>{separateUnits ? selectionReady ? "לפי הבחירות לכל יחידה" : "בחרו מידות למעלה" : size ? `מידה ${size}` : "בחרו מידה למעלה"}</span>}
                  </div>
                </div>
              </div>
              );
            })}
            <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: 22, fontWeight: 800 }}>{separateUnits && !selectionReady ? "בחרו מידות למעלה" : quoteState.pending ? "מחשב מחיר…" : quoteState.error ? "המחיר יתעדכן בסל" : fmt(bTotal)}</span>
                {bRegular - bTotal > 0 && <s style={{ fontSize: 14, color: "#8a8a86" }}>{fmt(bRegular)}</s>}
              </span>
              <button className="btn" style={{ height: 48, padding: "0 20px", fontSize: 15 }} onClick={addBundle}>
                הוספת {bCount} פריטים לסל
              </button>
            </div>
            {bErr && <div style={{ padding: "0 16px 14px" }} className="err">בחרו מידה לכל פריט מסומן בסט</div>}
          </div>}

          <div className="ship-list buy-pad">
            <div><IconTruck /><div><b>משלוח עד הבית</b> · חינם בהזמנה מעל {fmt(FREE_SHIPPING)}</div></div>
            <div><IconPin /><div><b>סניף באר שבע</b> · הפועלים 20 - אפשר להגיע ולמדוד</div></div>
            <div><IconPhone /><div><b>התלבטות במידה?</b> · <a href="tel:08-6233803" style={{ textDecoration: "underline" }}>08-6233803</a></div></div>
          </div>
          <div className="buy-pad">
            {accs.map((a) => (
              <div className={`acc${acc === a.id ? " is-open" : ""}`} key={a.id}>
                <button type="button" id={`product-${encodeURIComponent(p.id)}-${a.id}-trigger`} aria-expanded={acc === a.id} aria-controls={`product-${encodeURIComponent(p.id)}-${a.id}-panel`} onClick={() => setAcc((cur) => (cur === a.id ? null : a.id))}>
                  {a.title}
                  <span className="acc-toggle" aria-hidden="true" />
                </button>
                <div className="acc-panel" id={`product-${encodeURIComponent(p.id)}-${a.id}-panel`} role="region" aria-labelledby={`product-${encodeURIComponent(p.id)}-${a.id}-trigger`} aria-hidden={acc !== a.id} inert={acc !== a.id}>
                  <div className="acc-panel-inner"><div className="acc-content">
                    {a.lines.map((ln, i) => (
                      <div key={i} style={{ display: "grid", gridTemplateColumns: ln.k ? "110px 1fr" : "1fr", gap: 12 }}>
                        {ln.k && <span className="muted">{ln.k}</span>}
                        <span>{ln.v}</span>
                      </div>
                    ))}
                  </div></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <ProductReviews productId={id} productName={base.name} reviews={reviews} summary={ratings}
        interaction={reviewInteraction} onReviewInteraction={setReviewInteraction} />

      {(related.length > 0 || accP.length > 0) && (
        <div className="pdp-recommendations">
          {accP.length > 0 && (
            <section className="pdp-recommendation-section" aria-labelledby="accessory-products-title">
              <div className="pdp-recommendation-head">
                <h2 className="k" id="accessory-products-title">אביזרים משלימים</h2>
              </div>
              <div className="product-grid pdp-recommendation-grid">
                {accP.map((x) => <ProductTile key={x.id} p={x} />)}
              </div>
            </section>
          )}
          {related.length > 0 && (
            <section className="pdp-recommendation-section" aria-labelledby="related-products-title">
              <div className="pdp-recommendation-head">
                <h2 className="k" id="related-products-title">עוד מהקטגוריה</h2>
                {category(p.cat) && <Link href={`/c/${p.cat}`} className="pdp-recommendation-link">לכל מוצרי הקטגוריה <span aria-hidden="true">←</span></Link>}
              </div>
              <div className="product-grid pdp-recommendation-grid">
                {related.map((x) => <ProductTile key={x.id} p={x} />)}
              </div>
            </section>
          )}
        </div>
      )}

    </main>
  );
}

function GalleryFrame({ slide, name, deal, was, price }: { slide: { kind: string; src?: string; text?: string; rows?: { k: string; v: string }[] }; name: string; deal?: [number, number]; was?: number; price: number }) {
  return (
    <div className="g-main">
      {slide.kind === "img" && <ProductImage src={slide.src} sizes="(max-width: 767px) 100vw, 50vw" maxWidth={1280} fetchPriority="high" alt={name} />}
      {slide.kind === "ph" && <span className="k ph-xl">{slide.text}</span>}
      {slide.kind === "spec" && (
        <div className="spec-slide">
          <span className="k">מפרט</span>
          {slide.rows?.map((r) => (
            <div className="spec-row" key={r.k}>
              <span style={{ color: "#bdbdb7" }}>{r.k}</span>
              <span style={{ fontWeight: 700 }}>{r.v}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ position: "absolute", top: 12, right: 12, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
        {deal && <span className="badge y">{deal[0]} ב-{deal[1]} ₪</span>}
        {was && <span className="badge b">{saleBadge({ price, was } as Product)}</span>}
      </div>
    </div>
  );
}

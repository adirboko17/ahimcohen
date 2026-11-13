"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useCatalog } from "@/lib/catalog-context";
import { fmt } from "@/lib/pricing";
import { quantityOffer } from "@/lib/quantity-offers";
import { ProductImage } from "./ProductImage";
import { ProductBrand } from "./ProductBrand";
import { IconBag } from "./icons";
import { ProductTile } from "./ProductTile";

export function QuantityOffersView({ allOffers = false }: { allOffers?: boolean }) {
  const { products } = useCatalog();
  const offers = useMemo(() => products.flatMap((product) => {
    const offer = quantityOffer(product);
    return offer ? [{ product, offer }] : [];
  }), [products]);
  const discounted = useMemo(() => allOffers ? products.filter((product) =>
    product.was && product.was > product.price && !quantityOffer(product)
  ) : [], [allOffers, products]);
  const title = allOffers ? "המבצעים שלנו" : "מבצעי כמות";
  const count = offers.length + discounted.length;

  return (
    <main className="quantity-page wrap">
      <div className="crumbs"><Link href="/">בית</Link><span>/</span><span className="now">{title}</span></div>
      <header className="quantity-hero">
        <div className="quantity-hero-copy">
          <span className="quantity-eyebrow">{allOffers ? "לעבודה. לצוות. במחיר מיוחד." : "לעבודה. לצוות. לכמות."}</span>
          <h1 className="k">{title}</h1>
          <p>{allOffers ? "כל ההנחות ומבצעי הכמות במקום אחד." : "יותר יחידות. יותר משתלם."}</p>
          <span>{allOffers ? "מוצרים במחיר מבצע, מארזים והצעות משתלמות לכל הצוות." : "הכמות, המחיר הכולל והמחיר ליחידה — הכל לפניכם."}</span>
        </div>
        <div className="quantity-hero-count"><span className="k">{count.toLocaleString("he-IL")}</span><span>{allOffers ? "מבצעים במקום אחד" : "הצעות כמות במקום אחד"}</span></div>
      </header>
      {discounted.length > 0 && (
        <section aria-labelledby="discounted-title" style={{ marginBottom: 40 }}>
          <h2 id="discounted-title" className="k" style={{ fontSize: 40, margin: "0 0 20px" }}>מוצרים במחיר מבצע</h2>
          <div className="product-grid">{discounted.map((product) => <ProductTile key={product.id} p={product} />)}</div>
        </section>
      )}
      {allOffers && offers.length > 0 && <h2 className="k" style={{ fontSize: 40, margin: "0 0 20px" }}>מבצעי כמות ומארזים</h2>}
      {offers.length > 0 ? (
        <section className="quantity-grid" aria-label="כל מבצעי הכמות">
          {offers.map(({ product, offer }, index) => {
            const approximate = Math.abs(offer.unitPrice * 100 - Math.round(offer.unitPrice * 100)) > .00001;
            return (
              <article className="quantity-card" key={product.id}>
                <Link href={`/p/${encodeURIComponent(product.id)}?quantity-offer=1`} className="quantity-image" aria-label={offer.title} tabIndex={-1}>
                  {product.imgs?.[0] ? <ProductImage src={product.imgs[0]} alt={offer.title} loading={index < 2 ? "eager" : "lazy"} sizes="(max-width: 1100px) 45vw, 30vw" /> : <IconBag size={64} />}
                  <span className="quantity-badge"><b>{offer.quantity}</b><span>{offer.quantityLabel}{offer.kind === "pack" ? " במארז" : " במבצע"}</span></span>
                  <ProductBrand name={product.brand} />
                </Link>
                <div className="quantity-body">
                  <span className="quantity-kind">{offer.kind === "pack" ? "מארז במחיר מיוחד" : "קונים כמות, חוסכים יותר"}</span>
                  <h2><Link href={`/p/${encodeURIComponent(product.id)}?quantity-offer=1`}>{offer.title}</Link></h2>
                  <div className="quantity-price-box">
                    <span className="quantity-total-label">{offer.kind === "pack" ? "מחיר המארז כולו" : `מחיר כולל ל־${offer.quantity} ${offer.quantityLabel}`}</span>
                    <div className="quantity-prices"><strong><bdi>{fmt(offer.total)}</bdi></strong>{offer.regularTotal && <span>במקום <s><bdi>{fmt(offer.regularTotal)}</bdi></s></span>}</div>
                    <div className="quantity-unit"><b>{approximate ? "כ־" : ""}<bdi>{fmt(offer.unitPrice)}</bdi></b><span>{offer.unitLabel}</span></div>
                  </div>
                  <div className="quantity-terms">
                    <span>{offer.kind === "pack" ? `מארז אחד מכיל ${offer.quantity} ${offer.quantityLabel}` : `המחיר בקניית ${offer.quantity} ${offer.quantityLabel}`}</span>
                    {offer.saving > 0 && <b>חיסכון של <bdi>{fmt(offer.saving)}</bdi></b>}
                  </div>
                  <Link href={`/p/${encodeURIComponent(product.id)}?quantity-offer=1`} className="quantity-cta">{offer.kind === "pack" ? "לפרטי המארז" : "לבחירת צבע ומידה"}<span aria-hidden="true">←</span></Link>
                </div>
              </article>
            );
          })}
        </section>
      ) : count === 0 ? (
        <div className="empty">
          <p style={{ fontSize: 18 }}>{allOffers ? "אין כרגע מבצעים להצגה." : "אין כרגע מבצעי כמות להצגה."}</p>
          <Link href="/" className="btn btn-line" style={{ minHeight: 48, padding: "12px 24px" }}>חזרה לדף הבית</Link>
        </div>
      ) : null}
    </main>
  );
}

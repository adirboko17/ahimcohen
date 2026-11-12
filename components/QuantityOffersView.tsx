"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useCatalog } from "@/lib/catalog-context";
import { fmt } from "@/lib/pricing";
import { quantityOffer } from "@/lib/quantity-offers";
import { ProductImage } from "./ProductImage";
import { IconBag } from "./icons";

export function QuantityOffersView() {
  const { products } = useCatalog();
  const offers = useMemo(() => products.flatMap((product) => {
    const offer = quantityOffer(product);
    return offer ? [{ product, offer }] : [];
  }), [products]);

  return (
    <main className="quantity-page wrap">
      <div className="crumbs"><Link href="/">בית</Link><span>/</span><span className="now">מבצעי כמות</span></div>
      <header className="quantity-hero">
        <div className="quantity-hero-copy">
          <span className="quantity-eyebrow">לעבודה. לצוות. לכמות.</span>
          <h1 className="k">מבצעי כמות</h1>
          <p>יותר יחידות. יותר משתלם.</p>
          <span>הכמות, המחיר הכולל והמחיר ליחידה — הכל לפניכם.</span>
        </div>
        <div className="quantity-hero-count"><span className="k">{offers.length.toLocaleString("he-IL")}</span><span>הצעות כמות במקום אחד</span></div>
      </header>
      {offers.length > 0 ? (
        <section className="quantity-grid" aria-label="כל מבצעי הכמות">
          {offers.map(({ product, offer }, index) => {
            const approximate = Math.abs(offer.unitPrice * 100 - Math.round(offer.unitPrice * 100)) > .00001;
            return (
              <article className="quantity-card" key={product.id}>
                <Link href={`/p/${encodeURIComponent(product.id)}?quantity-offer=1`} className="quantity-image" aria-label={offer.title} tabIndex={-1}>
                  {product.imgs?.[0] ? <ProductImage src={product.imgs[0]} alt={offer.title} loading={index < 2 ? "eager" : "lazy"} sizes="(max-width: 600px) 90vw, (max-width: 1100px) 45vw, 30vw" /> : <IconBag size={64} />}
                  <span className="quantity-badge"><b>{offer.quantity}</b><span>{offer.quantityLabel}{offer.kind === "pack" ? " במארז" : " במבצע"}</span></span>
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
      ) : (
        <div className="empty">
          <p style={{ fontSize: 18 }}>אין כרגע מבצעי כמות להצגה.</p>
          <Link href="/" className="btn btn-line" style={{ minHeight: 48, padding: "12px 24px" }}>חזרה לדף הבית</Link>
        </div>
      )}
    </main>
  );
}

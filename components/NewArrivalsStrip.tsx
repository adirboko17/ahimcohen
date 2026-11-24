"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { startLoopAutoplay } from "@/lib/brand-carousel-autoplay";
import type { Product } from "@/lib/catalog";
import { fmt } from "@/lib/pricing";
import { ProductImage } from "./ProductImage";

const ARRIVAL_LIMIT = 10;

function arrivalLoopLength(track: HTMLElement) {
  return track.firstElementChild?.getBoundingClientRect().width ?? 0;
}

export function NewArrivalsStrip({ products }: { products: Product[] }) {
  const latest = useMemo(() => products.flatMap((product) => {
    const published = Date.parse(product.publishedAt ?? "");
    const image = product.imgs?.[0];
    if (!Number.isFinite(published) || !image) return [];
    if (product.choices?.length && !product.choices.some((choice) => choice.available)) return [];
    return [{ product, image, published }];
  }).sort((a, b) => b.published - a.published || a.product.id.localeCompare(b.product.id, "he"))
    .slice(0, ARRIVAL_LIMIT), [products]);

  const trackRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [looping, setLooping] = useState(false);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    const track = trackRef.current;
    const list = track?.firstElementChild;
    if (!track || !list) return;
    const measure = () => setLooping(latest.length > 1 && arrivalLoopLength(track) > track.clientWidth);
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    observer.observe(list);
    measure();
    return () => observer.disconnect();
  }, [latest.length]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || !looping || hovered) return;
    return startLoopAutoplay(track, arrivalLoopLength).stop;
  }, [looping, hovered]);

  if (!latest.length) return null;

  return (
    <section className="new-arrivals" aria-labelledby={titleId}>
      <div className="new-arrivals-inner">
        <h2 id={titleId} className="k new-arrivals-heading">חדש באתר</h2>
        <div
          className="new-arrivals-track scroller"
          ref={trackRef}
          onPointerEnter={(event) => { if (event.pointerType === "mouse") setHovered(true); }}
          onPointerLeave={(event) => { if (event.pointerType === "mouse") setHovered(false); }}
        >
          {(looping ? [false, true] : [false]).map((copy) => (
            <ul key={String(copy)} className={copy ? "new-arrivals-list new-arrivals-copy" : "new-arrivals-list"} aria-hidden={copy || undefined} role="list">
              {latest.map(({ product, image }) => (
                <li key={product.id}>
                  <Link href={`/p/${encodeURIComponent(product.id)}`} prefetch={false} tabIndex={copy ? -1 : undefined}>
                    <ProductImage src={image} alt="" sizes="48px" maxWidth={160} width={48} height={48} />
                    <span className="new-arrivals-product">
                      <span className="new-arrivals-name" dir="auto">{product.name}</span>
                      <bdi className="new-arrivals-price">{fmt(product.price)}</bdi>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </section>
  );
}

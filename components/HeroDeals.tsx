"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Product } from "@/lib/catalog";
import { heroDeals } from "@/lib/hero-deals";
import { ProductImage } from "./ProductImage";

const INTERVAL = 6000;

export function HeroDeals({ products }: { products: Product[] }) {
  const deals = useMemo(() => heroDeals(products), [products]);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [visible, setVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const currentIndex = deals.length ? index % deals.length : 0;
  const current = deals[currentIndex];
  const playing = deals.length > 1 && visible && pageVisible && !paused && !hovered && !focused && !pressed && !reducedMotion;

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotion = () => setReducedMotion(preference.matches);
    const syncVisibility = () => setPageVisible(!document.hidden);
    syncMotion();
    syncVisibility();
    preference.addEventListener("change", syncMotion);
    document.addEventListener("visibilitychange", syncVisibility);
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.25 });
    if (root.current) observer.observe(root.current);
    return () => {
      observer.disconnect();
      preference.removeEventListener("change", syncMotion);
      document.removeEventListener("visibilitychange", syncVisibility);
    };
  }, [deals.length > 0]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => setIndex(value => (value + 1) % deals.length), INTERVAL);
    return () => window.clearTimeout(timer);
  }, [playing, current?.id, deals.length]);

  if (!current) return null;
  const image = current.image && current.image !== failedImage ? current.image : undefined;

  return (
    <div
      ref={root}
      className="hero-deal-rotator"
      role="region"
      aria-label="מבצעים מתחלפים"
      onPointerEnter={event => { if (event.pointerType === "mouse") setHovered(true); }}
      onPointerLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}
    >
      <Link href={current.href} className={`hero-deal${image ? " hero-deal-image-link" : ""}`} onPointerDown={() => setPressed(true)} onPointerUp={() => setPressed(false)} onPointerCancel={() => setPressed(false)} onPointerLeave={() => setPressed(false)} aria-label={`${current.title}, ${current.description} - לפרטי המבצע`}>
        <span key={current.id} className={`hero-deal-slide${image ? " hero-deal-with-image" : ""}`}>
          {image && <span className="hero-deal-thumbnail">
            <ProductImage src={image} alt="" sizes="(max-width: 767px) 80px, 96px" maxWidth={192} width={96} height={96} onError={() => setFailedImage(image)} />
          </span>}
          <span className="hero-deal-copy">
            <span className="hero-deal-name">{current.title}</span>
            <span className="hero-deal-description">{current.description}</span>
          </span>
        </span>
      </Link>
      {deals.length > 1 && (
        <div className="hero-deal-controls">
          <button type="button" onClick={() => setIndex(value => (value + 1) % deals.length)} aria-label="למבצע הבא" title="למבצע הבא">←</button>
          {reducedMotion ? <span className="hero-deal-count">{currentIndex + 1}/{deals.length}</span> : (
            <button type="button" onClick={() => setPaused(value => !value)} aria-label={paused ? "הפעלת החלפת המבצעים" : "עצירת החלפת המבצעים"} aria-pressed={paused} title={paused ? "הפעלת החלפת המבצעים" : "עצירת החלפת המבצעים"}>
              <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">{paused ? <path d="M4 2 13 8 4 14Z" fill="currentColor" /> : <path d="M5 3v10M11 3v10" stroke="currentColor" strokeWidth="3" />}</svg>
              <span className="hero-deal-count" aria-hidden="true">{currentIndex + 1}/{deals.length}</span>
            </button>
          )}
        </div>
      )}
      <span className="hero-deal-progress" aria-hidden="true">
        <span key={`${current.id}-${playing}`} className={playing ? "is-playing" : ""} />
      </span>
    </div>
  );
}

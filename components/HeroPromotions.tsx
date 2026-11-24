"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { DEFAULT_HERO, heroImageTarget, heroTargetHref, type AdminHero, type HeroDevice } from "@/lib/admin/models";
import { IconBack, IconFwd } from "./icons";

export function HeroPromotions({ promotions }: { promotions: AdminHero[] }) {
  const first = promotions[0];
  const multiple = promotions.length > 1;
  const [selection, setSelection] = useState<{ current: string; previous?: string }>({ current: first.id });
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [onscreen, setOnscreen] = useState(false);
  const [pageVisible, setPageVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const frame = useRef<HTMLDivElement>(null);
  const index = Math.max(0, promotions.findIndex(({ id }) => id === selection.current));
  const current = promotions[index];
  const previous = promotions.find(({ id }) => id === selection.previous && id !== current.id);
  const next = promotions[(index + 1) % promotions.length];
  const running = multiple && onscreen && pageVisible && !paused && !hovered && !focused && !pressed && !reducedMotion;

  useEffect(() => {
    if (!multiple || !frame.current) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotion = () => setReducedMotion(preference.matches);
    const syncVisibility = () => setPageVisible(!document.hidden);
    syncMotion();
    syncVisibility();
    preference.addEventListener("change", syncMotion);
    document.addEventListener("visibilitychange", syncVisibility);
    const observer = new IntersectionObserver(([entry]) => setOnscreen(entry.isIntersecting && entry.intersectionRatio >= 0.15), { threshold: 0.15 });
    observer.observe(frame.current);
    return () => {
      observer.disconnect();
      preference.removeEventListener("change", syncMotion);
      document.removeEventListener("visibilitychange", syncVisibility);
    };
  }, [multiple]);

  const desktopFrame = first.desktop ?? first.mobile ?? DEFAULT_HERO.desktop;
  const mobileFrame = first.mobile ?? desktopFrame;
  const frameStyle = {
    "--hero-desktop-ratio": `${desktopFrame.width} / ${desktopFrame.height}`,
    "--hero-mobile-ratio": `${mobileFrame.width} / ${mobileFrame.height}`,
  } as CSSProperties;
  const slides = [current];
  if (previous) slides.push(previous);
  if (multiple && next.id !== previous?.id) slides.push(next);
  const move = (direction: -1 | 1) => {
    setSelection(({ current }) => {
      const index = Math.max(0, promotions.findIndex(({ id }) => id === current));
      const nextIndex = (index + direction + promotions.length) % promotions.length;
      return { current: promotions[nextIndex].id, previous: promotions[index].id };
    });
  };
  const rotationLabel = paused ? "הפעלת החלפה אוטומטית" : "עצירת החלפה אוטומטית";

  return <div className="home-hero-promotion">
    <h1 className="home-hero-promotion-heading">האחים כהן</h1>
    <div ref={frame} className="home-hero-promotion-frame" style={frameStyle}
      onPointerEnter={(event) => { if (event.pointerType === "mouse") setHovered(true); }}
      onPointerLeave={() => { setHovered(false); setPressed(false); }}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
      {slides.map((hero) => <HeroPromotionSlide key={hero.id} hero={hero}
        state={hero.id === current.id ? "active" : hero.id === previous?.id ? "previous" : "upcoming"}
        fade={hero.id === current.id && !!previous} highPriority={hero.id === first.id} />)}
    </div>
    {multiple && <>
      <div className="home-hero-promotion-progress" aria-hidden="true">
        <span key={current.id} data-running={running} onAnimationEnd={() => move(1)} />
      </div>
      <nav className="home-hero-promotion-controls" aria-label="מעבר בין באנרים">
        <button type="button" aria-label="הבאנר הקודם" onClick={() => move(-1)}><IconBack /></button>
        <span role="status" aria-live={running ? "off" : "polite"}><bdi>{index + 1}</bdi> מתוך <bdi>{promotions.length}</bdi></span>
        <button type="button" aria-label="הבאנר הבא" onClick={() => move(1)}><IconFwd /></button>
        {!reducedMotion && <button className="home-hero-promotion-rotation" type="button" aria-label={rotationLabel} title={rotationLabel}
          onClick={() => setPaused((value) => !value)}>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            {paused ? <path d="M4 2l9 6-9 6z" fill="currentColor" /> : <path d="M5 3v10m6-10v10" stroke="currentColor" strokeWidth="2" />}
          </svg>
        </button>}
      </nav>
    </>}
  </div>;
}

function HeroPromotionSlide({ hero, state, fade, highPriority }: {
  hero: AdminHero; state: "active" | "previous" | "upcoming"; fade: boolean; highPriority: boolean;
}) {
  const active = state === "active";
  const desktopImage = hero.desktop ?? hero.mobile ?? DEFAULT_HERO.desktop;
  const desktopTarget = heroImageTarget(hero, hero.desktop ? "desktop" : "mobile");
  const mobileTarget = heroImageTarget(hero, hero.mobile ? "mobile" : "desktop");
  const desktopHref = desktopTarget && heroTargetHref(desktopTarget);
  const mobileHref = mobileTarget && heroTargetHref(mobileTarget);
  const alt = hero.alt ?? "מבצע בחנות האחים כהן";
  const linkLabel = (device: HeroDevice) => {
    const target = device === "desktop" ? desktopTarget : mobileTarget;
    return target && target.kind !== "link" ? target.label : alt;
  };
  const picture = <picture>
    {hero.desktop && hero.mobile && <source media="(width < 1024px)" srcSet={hero.mobile.src} width={hero.mobile.width} height={hero.mobile.height} />}
    <img src={desktopImage.src} width={desktopImage.width} height={desktopImage.height} alt={alt}
      fetchPriority={highPriority ? "high" : active ? "auto" : "low"} />
  </picture>;

  return <div className="home-hero-promotion-slide" data-state={state} data-fade={fade} inert={!active} aria-hidden={!active || undefined}>
      {desktopHref && desktopHref === mobileHref
        ? <Link className="home-hero-promotion-image-link" href={desktopHref} aria-label={linkLabel("desktop")} prefetch={false}>{picture}</Link>
        : <>
          {picture}
          {desktopHref && <Link className="home-hero-promotion-overlay" data-device="desktop" href={desktopHref} aria-label={linkLabel("desktop")} prefetch={false} />}
          {mobileHref && <Link className="home-hero-promotion-overlay" data-device="mobile" href={mobileHref} aria-label={linkLabel("mobile")} prefetch={false} />}
        </>}
  </div>;
}

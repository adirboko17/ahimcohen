"use client";

import { useState, type CSSProperties } from "react";
import styles from "./ProductReviews.module.css";

const reviewRatings = [1, 2, 3, 4, 5] as const;

function Star({ fill, size }: { fill: number; size: number }) {
  const path = "m12 2.75 2.84 5.75 6.35.92-4.6 4.49 1.09 6.33L12 17.25l-5.68 2.99 1.09-6.33-4.6-4.49 6.35-.92L12 2.75Z";
  return <span className={styles.star} style={{ "--star-size": `${size}px` } as CSSProperties} aria-hidden="true">
    <svg viewBox="0 0 24 24" fill="none"><path d={path} stroke="currentColor" strokeWidth="1.65" strokeLinejoin="round" /></svg>
    {fill > 0 && <span className={styles.starFill} style={{ inlineSize: `${fill * 100}%` }}>
      <svg viewBox="0 0 24 24" fill="currentColor"><path d={path} stroke="currentColor" strokeWidth="1.65" strokeLinejoin="round" /></svg>
    </span>}
  </span>;
}

export function ReviewStars({ rating, size = 20 }: { rating: number; size?: number }) {
  return <span className={styles.stars} role="img" aria-label={`${rating} מתוך 5 כוכבים`}>
    {reviewRatings.map((star) => <Star key={star} size={size} fill={Math.min(1, Math.max(0, rating - star + 1))} />)}
  </span>;
}

export function ReviewRatingInput({ initialRating = 0, starSize = 29, label = "דירוג" }: { initialRating?: number; starSize?: number; label?: string }) {
  const [rating, setRating] = useState(initialRating);
  const [hovered, setHovered] = useState<number | null>(null);
  return <fieldset className={styles.ratingInput}>
    <legend>{label}</legend>
    <div className={styles.ratingOptions} onPointerLeave={() => setHovered(null)}>
      {reviewRatings.map((star) => <label key={star} onPointerEnter={(event) => { if (event.pointerType === "mouse") setHovered(star); }}>
        <input type="radio" name="rating" value={star} required checked={star === rating} onChange={() => setRating(star)}
          aria-label={star === 1 ? "כוכב אחד" : `${star} כוכבים`} />
        <Star size={starSize} fill={star <= (hovered ?? rating) ? 1 : 0} />
      </label>)}
    </div>
  </fieldset>;
}

"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { submitProductReview } from "@/app/actions/product-review";
import type { PublishedReview } from "@/lib/admin/models";
import { lockPageScroll } from "@/lib/page-scroll-lock";
import { IconCheck, IconPencil, IconPlus } from "./icons";
import { ReviewRatingInput, ReviewStars } from "./ReviewStars";
import styles from "./ProductReviews.module.css";

const reviewDate = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jerusalem" });

export function reviewSummary(reviews: PublishedReview[]) {
  const count = reviews.length;
  const total = reviews.reduce((sum, { rating }) => sum + rating, 0);
  return { count, average: count ? Math.round(total / count * 10) / 10 : 0 };
}

type ReviewSummary = ReturnType<typeof reviewSummary>;
const reviewCount = (count: number) => count === 1 ? "ביקורת אחת" : `${count.toLocaleString("he-IL")} ביקורות`;

export type ReviewInteraction = { source: "title" | "section"; opener: HTMLButtonElement | null } | null;
type ReviewControls = { interaction: ReviewInteraction; onReviewInteraction: (interaction: ReviewInteraction) => void };

export function ProductReviewsLink({ summary, interaction, onReviewInteraction }: ReviewControls & { summary: ReviewSummary }) {
  const receipt = useRef<HTMLSpanElement>(null);
  const sent = !!interaction && !interaction.opener;
  const sentFromTitle = sent && interaction.source === "title";
  const writing = interaction?.source === "title" && !!interaction.opener;
  useEffect(() => { if (sentFromTitle) receipt.current?.focus({ preventScroll: true }); }, [sentFromTitle]);

  if (sentFromTitle || (!summary.count && sent)) {
    return <span className={styles.jump} ref={receipt} tabIndex={sentFromTitle ? -1 : undefined}
      role={sentFromTitle ? "status" : undefined}>הביקורת ממתינה לאישור</span>;
  }
  if (!summary.count) return <div className={styles.jump}>
    <span>עדיין אין ביקורות</span>
    <span aria-hidden="true">·</span>
    <button className={styles.firstReview} type="button" aria-label="כתבו את הביקורת הראשונה" aria-haspopup="dialog" aria-expanded={writing}
      aria-controls={writing ? "product-review-dialog" : undefined}
      onClick={(event) => onReviewInteraction({ source: "title", opener: event.currentTarget })}>כתבו את הראשונה</button>
  </div>;

  return <a className={styles.jump} href="#product-reviews">
    <ReviewStars rating={summary.average} size={14} />
    <span>{reviewCount(summary.count)}</span>
  </a>;
}

export function ProductReviews({ productId, productName, reviews, summary, interaction, onReviewInteraction }: ReviewControls & { productId: string; productName: string; reviews: PublishedReview[]; summary: ReviewSummary }) {
  const receipt = useRef<HTMLParagraphElement>(null);
  const [visibleCount, setVisibleCount] = useState(6);
  const hasReviews = summary.count > 0;
  const sent = !!interaction && !interaction.opener;
  const sentFromSection = sent && interaction.source === "section";
  const writing = interaction?.source === "section" && !!interaction.opener;

  useEffect(() => { if (sentFromSection) receipt.current?.focus(); }, [sentFromSection]);

  function closeForm() {
    onReviewInteraction(null);
    interaction?.opener?.focus({ preventScroll: true });
  }

  const reviewAction = sent
    ? <p className={styles.receipt} ref={receipt} tabIndex={sentFromSection ? -1 : undefined} role={sentFromSection ? "status" : undefined}><IconCheck />תודה, הביקורת ממתינה לאישור.</p>
    : <button className={styles.write} type="button" aria-haspopup="dialog" aria-expanded={writing}
      aria-controls={writing ? "product-review-dialog" : undefined}
      onClick={(event) => onReviewInteraction({ source: "section", opener: event.currentTarget })}>
      {!hasReviews && <IconPlus size={15} />}
      כתבו ביקורת
    </button>;

  return <section className={hasReviews ? styles.section : `${styles.section} ${styles.emptySection}`} id="product-reviews" aria-labelledby="product-reviews-title">
    <header className={styles.header}>
      <div>
        <h2 id="product-reviews-title" className={styles.title}>ביקורות למוצר</h2>
        {hasReviews ? <p className={styles.summary}>
          <ReviewStars rating={summary.average} size={15} />
          <strong aria-hidden="true">{summary.average.toFixed(1)}</strong>
          <span aria-hidden="true">·</span>
          <span>{reviewCount(summary.count)}</span>
        </p> : !sent && <p className={styles.emptyCopy}>אין עדיין ביקורות</p>}
      </div>
      {reviewAction}
    </header>

    {interaction?.opener && <ReviewDialog productId={productId} productName={productName} close={closeForm}
      onSent={() => onReviewInteraction({ source: interaction.source, opener: null })} />}

    {reviews.length > 0 && <div className={styles.cards}>
      {reviews.slice(0, visibleCount).map(({ id, author, rating, text, createdAt }) => <article key={id} className={styles.review}>
        <header className={styles.reviewMeta}>
          <div className={styles.reviewAuthor}>
            <h3 dir="auto">{author}</h3>
            <ReviewStars rating={rating} size={15} />
          </div>
          {createdAt && <time dateTime={createdAt}>{reviewDate.format(new Date(createdAt))}</time>}
        </header>
        <p dir="auto">{text}</p>
      </article>)}
    </div>}
    {visibleCount < reviews.length && <button type="button" className={`${styles.textButton} ${styles.more}`} onClick={() => setVisibleCount((count) => count + 6)}>עוד ביקורות</button>}
  </section>;
}

function ReviewDialog({ productId, productName, close, onSent }: { productId: string; productName: string; close: () => void; onSent: () => void }) {
  const action = useMemo(() => submitProductReview.bind(null, productId), [productId]);
  const [result, submit, pending] = useActionState(action, null);
  const [author, setAuthor] = useState("");
  const [review, setReview] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const releaseScroll = lockPageScroll();
    element.showModal();
    heading.current?.focus({ preventScroll: true });
    return () => {
      if (element.open) element.close();
      releaseScroll();
    };
  }, []);

  useEffect(() => {
    if (!result?.ok) return;
    dialog.current?.close();
    onSent();
  }, [result, onSent]);

  function dismiss() {
    if (pending) return;
    dialog.current?.close();
    close();
  }

  return <dialog className={styles.dialog} id="product-review-dialog" ref={dialog} aria-labelledby="product-review-form-title"
    aria-describedby="product-review-product-name" onCancel={(event) => { event.preventDefault(); dismiss(); }} onClick={(event) => {
      if (event.target !== event.currentTarget) return;
      const { top, bottom, left, right } = event.currentTarget.getBoundingClientRect();
      if (event.clientY < top || event.clientY > bottom || event.clientX < left || event.clientX > right) dismiss();
    }}>
    <header className={styles.dialogHeader}>
      <span className={styles.dialogIcon} aria-hidden="true"><IconPencil /></span>
      <div className={styles.dialogHeading}>
        <h2 id="product-review-form-title" ref={heading} tabIndex={-1}>כתיבת ביקורת</h2>
        <p id="product-review-product-name" dir="auto">{productName}</p>
      </div>
      <button className={styles.close} type="button" onClick={dismiss} disabled={pending} aria-label="סגירת חלון הביקורת">×</button>
    </header>
    <form id="product-review-form" aria-labelledby="product-review-form-title" action={submit} aria-busy={pending}>
      <div className={styles.formBody}>
        <div className={styles.ratingPanel}><ReviewRatingInput starSize={30} label="איך הייתם מדרגים את המוצר?" /></div>
        <label className={styles.field}>שם לתצוגה
          <input name="author" required maxLength={80} value={author} onChange={(event) => setAuthor(event.target.value)} dir="auto" autoComplete="nickname" />
        </label>
        <label className={styles.field}>הביקורת שלכם
          <textarea name="review" required maxLength={2000} rows={3} value={review} onChange={(event) => setReview(event.target.value)} dir="auto"
            placeholder="מה כדאי לדעת על המוצר?" />
        </label>
        <div hidden><label>אתר<input name="website" type="text" autoComplete="off" tabIndex={-1} /></label></div>
        {result && !result.ok && <p className={styles.error} role="alert">{result.message}</p>}
      </div>
      <footer className={styles.formFooter}>
        <p className={styles.formNote}>הביקורת תופיע לאחר אישור.</p>
        <div className={styles.formActions}>
          <button className={styles.cancel} type="button" onClick={dismiss} disabled={pending}>ביטול</button>
          <button className={styles.send} type="submit" disabled={pending}>{pending ? "שולחים…" : "שליחת ביקורת"}</button>
        </div>
      </footer>
    </form>
  </dialog>;
}

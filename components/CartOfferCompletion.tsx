"use client";

import { useId, useRef, useState } from "react";
import type { CartGroup } from "@/lib/cart-groups";
import { offerMissingQuantity } from "@/lib/cart-groups";
import { quantitySelection, type QuantityUnit } from "@/lib/quantity-selection";
import { productSizeOptions } from "@/lib/sizes";
import { fmt } from "@/lib/pricing";
import { useStore } from "@/lib/store";
import { QuantityUnitPicker } from "./QuantityUnitPicker";
import { useCartQuote } from "@/lib/use-cart-quote";
import { completionCart, completionPrice } from "@/lib/offer-completion-price";
import { cartUnitPresets } from "@/lib/cart-unit-presets";

export function CartOfferCompletion({ group, disabled = false }: { group: CartGroup; disabled?: boolean }) {
  const { addMany, cartOpen, cart, cartQuote } = useStore();
  const [open, setOpen] = useState(false);
  const [choices, setChoices] = useState<Record<number, QuantityUnit>>({});
  const [showErrors, setShowErrors] = useState(false);
  const submitted = useRef(false);
  const form = useRef<HTMLDivElement>(null);
  const formId = useId();
  const offer = group.offer;
  const count = group.lines.reduce((sum, line) => sum + line.qty, 0);
  const missing = offer ? offerMissingQuantity(offer, count) : 0;
  const { product } = group;
  const availableColors = product.colors.map((_, index) => index).filter((index) => productSizeOptions(product, product.colors[index]).some((option) => option.available));
  const currentColor = product.colors.indexOf(group.lines[0]?.color);
  const color = availableColors.includes(currentColor) ? currentColor : availableColors[0] ?? 0;
  const sizes = productSizeOptions(product, product.colors[color] || "");
  const hasStock = sizes.some((option) => option.available);
  const defaultSize = sizes.length === 1 && sizes[0].available ? sizes[0].label : null;
  const selection = quantitySelection(product, Array.from({ length: missing }, (_, index) => choices[index] ?? { color, size: defaultSize }));
  const presets = cartUnitPresets(product, group.lines);
  const preview = useCartQuote(open && selection.complete && missing > 0 ? completionCart(cart, selection.quoteLines) : []);
  const price = completionPrice(cartQuote.quote, preview.quote);
  const pricePending = selection.complete && (preview.pending || cartQuote.pending);
  const priceError = preview.error || cartQuote.error;
  const priceReady = selection.complete && !!price && !pricePending && !priceError;
  if (!offer || !missing) return null;
  const missingLabel = missing === 1 ? "חסרה יחידה אחת" : `חסרות ${missing} יחידות`;
  const add = () => {
    if (disabled || submitted.current) return;
    if (!selection.complete) {
      setShowErrors(true);
      form.current?.querySelector<HTMLSelectElement>('select[data-missing="true"]')?.focus();
      return;
    }
    if (!priceReady) return;
    submitted.current = true;
    addMany(selection.items, cartOpen);
  };
  return <div className="cart-offer-completion">
    <div role="status" aria-live="polite">
      <strong>הנחת הכמות אינה פעילה</strong>
      <p>{missingLabel} כדי לקבל את מחיר המבצע: {offer.quantity} יחידות ב־{fmt(offer.total)}.</p>
    </div>
    {!hasStock ? <p className="err">אין כרגע יחידות זמינות להשלמת המבצע.</p> : <>
      <button type="button" className="btn btn-line" disabled={disabled} aria-expanded={open} aria-controls={formId} onClick={() => setOpen((value) => !value)}>
        {open ? "סגירת בחירת היחידות" : missing === 1 ? "השלמת יחידה למבצע" : `השלמת ${missing} יחידות למבצע`}
      </button>
      {open && <div id={formId} ref={form}>
        <div className="cart-completion-presets">
          <b>בחירה מהירה כמו בסל</b>
          <p>{missing === 1 ? "אותו צבע ואותה מידה בלחיצה אחת." : "החלת אותו צבע ואותה מידה על כל היחידות החסרות."} אפשר לשנות כל יחידה בנפרד בהמשך.</p>
          <div>{presets.map((preset) => <button type="button" key={preset.key} className="btn btn-line" disabled={disabled || !preset.available} onClick={() => {
            if (disabled || !preset.available) return;
            setChoices(Object.fromEntries(Array.from({ length: missing }, (_, index) => [index, { ...preset.selection }])));
            setShowErrors(false);
          }}>{preset.available ? preset.label : `${preset.label} - לא זמין כרגע`}</button>)}</div>
        </div>
        <QuantityUnitPicker product={product} rows={selection.rows} showErrors={showErrors} disabled={disabled} onChange={(index, choice) => {
          setChoices((previous) => ({ ...previous, [index]: choice }));
          setShowErrors(false);
        }} />
        <div className="cart-completion-price" aria-live="polite" aria-busy={pricePending}>
          {!selection.complete ? <p>בחרו צבע ומידה לכל יחידה כדי לראות את המחיר לפני ההוספה.</p> : pricePending ? <p>מחשבים את המחיר והחיסכון אחרי ההשלמה…</p> : priceError ? <div role="alert"><p>{priceError}</p><button type="button" className="cart-edit-link" disabled={disabled} onClick={() => { preview.retry(); cartQuote.retry(); }}>חישוב המחיר מחדש</button></div> : price && <>
            <dl>
              <div><dt>{price.addedPayment < 0 ? "הסכום לתשלום יקטן ב־" : "תוספת לתשלום אחרי ההנחה"}</dt><dd>{fmt(Math.abs(price.addedPayment))}</dd></div>
              <div className="cart-completion-total"><dt>סה״כ מוצרים בסל לאחר ההשלמה</dt><dd>{fmt(price.cartTotal)}</dd></div>
              <div><dt>{price.additionalSavings < 0 ? "ירידה בהנחות הסל" : "חיסכון נוסף בזכות ההשלמה"}</dt><dd>{fmt(Math.abs(price.additionalSavings))}</dd></div>
              {price.totalSavings !== price.additionalSavings && <div><dt>סך החיסכון בסל לאחר ההשלמה</dt><dd>{fmt(price.totalSavings)}</dd></div>}
            </dl>
            <p>התוספת לתשלום כוללת גם את השינוי בהנחה על הפריטים שכבר בסל. המשלוח יחושב בקופה.</p>
          </>}
        </div>
        <button type="button" className="btn cart-offer-add" disabled={disabled || (selection.complete && !priceReady)} onClick={add}>{missing === 1 ? "הוספת היחידה והשלמת המבצע" : `הוספת ${missing} יחידות והשלמת המבצע`}</button>
      </div>}
    </>}
  </div>;
}

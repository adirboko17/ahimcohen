"use client";

import { useCatalog } from "@/lib/catalog-context";
import { cartGroups, cartGroupPrice } from "@/lib/cart-groups";
import { fmt } from "@/lib/pricing";
import { useStore } from "@/lib/store";
import { CartItem } from "./CartItem";
import { CartOfferCompletion } from "./CartOfferCompletion";

export function CartContents({ disabled = false }: { disabled?: boolean }) {
  const { cart, cartQuote } = useStore();
  const { product } = useCatalog();
  return <>{cartGroups(cart, product).map((group) => {
    if (!group.offer) return <CartItem key={group.key} line={group.lines[0]} product={group.product} disabled={disabled} />;
    const count = group.lines.reduce((sum, line) => sum + line.qty, 0);
    const price = cartGroupPrice(group.lines, cartQuote.quote);
    let unitNumber = 0;
    return <section className="cart-quantity-group" key={group.key} aria-label={`מבצע כמות: ${group.offer.title}`}>
      <header className="cart-quantity-heading">
        <span className="badge y">מבצע כמות · {count} יחידות</span>
        <strong>{group.offer.title}</strong>
        <div className="cart-quantity-total" aria-live="polite">
          <span>מחיר כולל ל־{count} יחידות</span>
          <b>{cartQuote.pending ? "מחשב מחיר…" : cartQuote.error || !price ? "המחיר לא זמין" : fmt(price.total)}</b>
        </div>
        {price && price.savings > 0 && <div className="cart-quantity-saving"><s>{fmt(price.regular)}</s><span>חסכתם {fmt(price.savings)}</span></div>}
      </header>
      {count < group.offer.quantity && <CartOfferCompletion key={JSON.stringify(group.lines.map(({ key, qty, variantId }) => [key, qty, variantId]))} group={group} disabled={disabled} />}
      {group.lines.flatMap((line) => Array.from({ length: line.qty }, (_, index) =>
        <CartItem key={`${line.key}:${index}`} line={{ ...line, qty: 1 }} product={group.product} disabled={disabled} unitNumber={++unitNumber} />,
      ))}
    </section>;
  })}</>;
}

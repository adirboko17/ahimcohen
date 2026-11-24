"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { ORDERS, PM, colorLabel, type DemoOrder, type Product } from "@/lib/catalog";
import { useCatalog } from "@/lib/catalog-context";
import { fmt, priceFor } from "@/lib/pricing";
import { cartProductImage } from "@/lib/product-selection";
import { previewReorder, type ReorderVariantEdit } from "@/lib/reorder";
import { sizeLabel } from "@/lib/sizes";
import { useStore } from "@/lib/store";
import type { AddItem, OrderLine } from "@/lib/types";
import { IconBag, IconFwd, IconPackages } from "./icons";
import { ProductImage } from "./ProductImage";
import { ReorderVariantPicker } from "./ReorderVariantPicker";

const previewCount = 3;

const demoHandles: Readonly<Record<string, string>> = {
  p1: "חולצת-טי-גים-דריפייט-שק",
  p3: "סווטשירט-5-25",
  p7: "זקט-פליז",
  p8: "מעיל-סופטשל-טקטי-עם-כובע-נשלף",
};

export function AccountOrders() {
  return <section className="account-orders" aria-label="ההזמנות שלי">
    {ORDERS.map((order) => <OrderCard key={order.no} order={order} />)}
  </section>;
}

function OrderCard({ order }: { order: DemoOrder }) {
  const { product } = useCatalog();
  const { addMany } = useStore();
  const [expanded, setExpanded] = useState(false);
  const [showReorder, setShowReorder] = useState(false);
  const itemsId = useId();
  const headingId = useId();
  const details = order.lines.map(([id, color, size, quantity]) => {
    const snapshot = PM[id];
    const current = product(demoHandles[id] ?? id) ?? product(id);
    const line: OrderLine = [current?.id ?? demoHandles[id] ?? id, color, size, quantity];
    return {
      line,
      current,
      name: snapshot?.name ?? current?.name ?? "מוצר מההזמנה",
      image: (current && cartProductImage(current, { color, size })) ?? snapshot?.imgs?.[0],
      total: snapshot ? priceFor(snapshot, quantity) : undefined,
    };
  });
  const lines = details.map(({ line }) => line);
  const units = lines.reduce((sum, line) => sum + line[3], 0);
  const total = details.every((item) => item.total !== undefined)
    ? details.reduce((sum, item) => sum + (item.total ?? 0), 0)
    : undefined;
  const remaining = lines.length - previewCount;
  const addToCart = (items: AddItem[]) => {
    setShowReorder(false);
    addMany(items, true);
  };

  function reorder() {
    const result = previewReorder(lines, product);
    if (result.unavailable.length) setShowReorder(true);
    else if (result.items.length) addToCart(result.items);
  }

  return <article className="account-order" aria-labelledby={headingId}>
    <header className="account-order-heading">
      <div>
        <h2 id={headingId}>הזמנה <bdi>#{order.no}</bdi></h2>
        <time dateTime={order.date.split(".").reverse().join("-")}>{order.date}</time>
      </div>
      <span className="account-order-units">{units === 1 ? "יחידה אחת" : `${units} יחידות`}</span>
    </header>
    <ul className="account-order-items" id={itemsId}>
      {(expanded ? details : details.slice(0, previewCount)).map(({ line, current, name, image, total }, index) => {
        const [, color, size, quantity] = line;
        const selection = [colorLabel(color), sizeLabel(size) || "מידה אחת"].filter(Boolean).join(" · ");
        const info = <>
          <OrderItemPhoto image={image} quantity={quantity} />
          <span className="account-order-item-info">
            <strong>{name}</strong>
            <span className="account-order-item-meta">
              <small>{selection}</small>
              {total !== undefined && <bdi>{fmt(total)}</bdi>}
            </span>
          </span>
        </>;
        return <li key={index} className="account-order-item">
          {current ? <Link href={`/p/${encodeURIComponent(current.id)}?${new URLSearchParams({ color, size })}`} prefetch={false}>{info}</Link> : <div>{info}</div>}
        </li>;
      })}
    </ul>
    {remaining > 0 && <button className="account-order-expand" type="button" aria-expanded={expanded} aria-controls={itemsId}
      onClick={() => setExpanded((value) => !value)}>
      {expanded ? "הצגת פחות פריטים" : remaining === 1 ? "הצגת פריט נוסף" : `הצגת עוד ${remaining} פריטים`}
      <IconFwd />
    </button>}
    <footer className="account-order-footer">
      {total !== undefined && <div className="account-order-total"><span>סה״כ להזמנה</span><bdi>{fmt(total)}</bdi></div>}
      <button className="btn account-order-reorder" type="button" aria-expanded={showReorder || undefined} disabled={!lines.length} onClick={reorder}>
        <IconBag size={19} />הזמנה חוזרת
      </button>
    </footer>
    {showReorder && <OrderReorderOptions lines={lines} itemNames={details.map(({ name }) => name)}
      product={product} onAdd={addToCart} onClose={() => setShowReorder(false)} />}
  </article>;
}

function OrderItemPhoto({ image, quantity }: { image?: string; quantity: number }) {
  const [failedImage, setFailedImage] = useState<string>();
  return <span className="account-order-item-photo">
    {image && image !== failedImage
      ? <ProductImage src={image} alt="" width={320} height={200} sizes="(max-width: 600px) 74px, 300px" maxWidth={600}
          onError={() => setFailedImage(image)} />
      : <IconPackages />}
    <bdi className="account-order-item-quantity">×{quantity}</bdi>
  </span>;
}

function OrderReorderOptions({ lines, itemNames, product, onAdd, onClose }: {
  lines: OrderLine[];
  itemNames: string[];
  product: (id: string) => Product | undefined;
  onAdd: (items: AddItem[]) => void;
  onClose: () => void;
}) {
  const [variants, setVariants] = useState<Record<number, ReorderVariantEdit>>({});
  const headingId = useId();
  const original = previewReorder(lines, product);
  const selected = previewReorder(lines, product, {}, variants);
  const availableIndices = new Set(selected.available.map(({ sourceIndex }) => sourceIndex));
  return <section className="account-order-options" aria-labelledby={headingId}>
    <h3 id={headingId}>זמינות להזמנה חוזרת</h3>
    <p role="status">{selected.unavailable.length ? "פריטים בצבע או במידה שהוזמנו אזלו או הוסרו מהקטלוג. אפשר לבחור חלופה או להוסיף לסל את הפריטים הזמינים." : "כל הפריטים שבחרתם זמינים להוספה לסל."}</p>
    <ul>
      {original.unavailable.map(({ sourceIndex, pid, name, color, size, quantity }) => {
        const edit = variants[sourceIndex];
        const current = product(pid);
        return <li key={sourceIndex}>
          <strong>{itemNames[sourceIndex] ?? name}</strong>
          <small>{[color, size, `${quantity} יח׳`].filter(Boolean).join(" · ")}</small>
          <ReorderVariantPicker product={current} color={edit?.color ?? color} size={edit?.size ?? size} onChange={(change) => {
            setVariants((current) => ({ ...current, [sourceIndex]: { ...current[sourceIndex], ...change } }));
          }} />
          {availableIndices.has(sourceIndex) && <small>החלופה זמינה ותתווסף לסל</small>}
        </li>;
      })}
    </ul>
    <div className="account-order-options-actions">
      {selected.items.length > 0 && <button className="btn" type="button" onClick={() => onAdd(selected.items)}>
        {selected.unavailable.length ? "הוספת הזמינים לסל" : "הוספת הפריטים לסל"}
      </button>}
      <button className="btn btn-line" type="button" onClick={onClose}>סגירה</button>
    </div>
  </section>;
}

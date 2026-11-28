"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCatalog } from "@/lib/catalog-context";
import { orderCartSelection, type CustomerOrder, type HistoryLine, type HistoryPage, type OrderHistoryPage } from "@/lib/customer-orders";
import { useStore } from "@/lib/store";
import { IconPackages } from "./icons";
import styles from "./AccountView.module.css";

const statuses: Record<string, string> = {
  PAID: "שולמה", AUTHORIZED: "התשלום אושר", PARTIALLY_PAID: "שולמה חלקית", PENDING: "ממתינה לתשלום",
  REFUNDED: "ניתן החזר", PARTIALLY_REFUNDED: "ניתן החזר חלקי", VOIDED: "התשלום בוטל", EXPIRED: "תוקף התשלום פג",
  FULFILLED: "הטיפול בהזמנה הושלם", UNFULFILLED: "ממתינה לטיפול", PARTIALLY_FULFILLED: "טופלה חלקית",
  IN_PROGRESS: "בטיפול", ON_HOLD: "בהשהיה", OPEN: "פתוחה", RESTOCKED: "הוחזרה למלאי",
  SCHEDULED: "מתוזמנת לטיפול", REQUEST_DECLINED: "בקשת הטיפול נדחתה",
};
type FetchPage = <T extends HistoryPage<unknown>>(params: URLSearchParams, signal: AbortSignal) => Promise<T>;

export function CustomerOrderHistory() {
  const { account } = useStore();
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [allDates, setAllDates] = useState<boolean | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const request = useRef<AbortController | null>(null);
  const auth = account.client;
  const fetchPage: FetchPage = useCallback(async (params, signal) => {
    const session = (await auth?.getSession())?.data.session;
    if (!session) throw new Error("session");
    const res = await fetch("/api/account/orders?" + params, { cache: "no-store", signal, headers: { Authorization: "Bearer " + session.access_token } });
    if (!res.ok) throw new Error("orders");
    return res.json();
  }, [auth]);

  const load = useCallback(async (cursor: string | null) => {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError(false);
    try {
      const page = await fetchPage<OrderHistoryPage>(new URLSearchParams(cursor ? { after: cursor } : {}), controller.signal);
      if (controller.signal.aborted) return;
      setOrders(previous => cursor ? [...new Map([...previous, ...page.items].map(o => [o.id, o])).values()] : page.items);
      setNext(page.next);
      setAllDates(page.allDates);
    } catch {
      if (!controller.signal.aborted) setError(true);
    } finally {
      if (request.current === controller) { request.current = null; setLoading(false); }
    }
  }, [fetchPage]);

  useEffect(() => {
    void load(null);
    return () => { request.current?.abort(); request.current = null; };
  }, [load]);

  return <section className={`${styles.tile} ${styles.history}`}>
    <h2><IconPackages /> ההזמנות שלי</h2>
    {allDates === false && <p>מוצגות הזמנות מ־60 הימים האחרונים.</p>}
    {orders.map(order => <OrderCard key={order.id} order={order} fetchPage={fetchPage} />)}
    {loading && <p role="status">טוענים הזמנות…</p>}
    {!error && !loading && !orders.length && !next && <p>{allDates ? "עדיין אין הזמנות המשויכות לכתובת המייל הזו." : "אין הזמנות להצגה בתקופה הזו."}</p>}
    {error && <p role="alert">לא הצלחנו לטעון את ההזמנות.</p>}
    {(error || next) && <button type="button" className={styles.textButton} disabled={loading} onClick={() => void load(next)}>
      {error ? "ניסיון נוסף" : "הצגת הזמנות נוספות"}</button>}
  </section>;
}

function OrderCard({ order, fetchPage }: { order: CustomerOrder; fetchPage: FetchPage }) {
  const { product } = useCatalog();
  const { addMany, cart } = useStore();
  const [lines, setLines] = useState<HistoryLine[] | null>(null);
  const [partial, setPartial] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => { request.current?.abort(); }, []);
  const selection = lines && orderCartSelection(lines, product, cart);

  async function open(reorder: boolean) {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true); setError(false); setPartial(false);
    try {
      const params = new URLSearchParams({ order: order.id.split("/").pop()! });
      const items: HistoryLine[] = [];
      let page: HistoryPage<HistoryLine>;
      do {
        page = await fetchPage<HistoryPage<HistoryLine>>(params, controller.signal);
        items.push(...page.items);
        if (page.next) params.set("after", page.next);
      } while (page.next && !controller.signal.aborted);
      if (controller.signal.aborted) return;
      setLines(items);
      if (reorder) {
        const ready = orderCartSelection(items, product, cart);
        if (ready.items.length && !ready.unavailable.length) addMany(ready.items, true);
        else setPartial(true);
      }
    } catch {
      if (!controller.signal.aborted) setError(true);
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  const money = order.currentTotalPriceSet.presentmentMoney;
  return <article className={styles.order}>
    <div className={styles.orderHeading}><h3>הזמנה <bdi>{order.name}</bdi></h3>
      <time dateTime={order.createdAt}>{new Date(order.createdAt).toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" })}</time>
      <strong>{new Intl.NumberFormat("he-IL", { style: "currency", currency: money.currencyCode }).format(Number(money.amount))}</strong></div>
    <p>{order.cancelledAt ? "ההזמנה בוטלה" : statuses[order.displayFulfillmentStatus] ?? order.displayFulfillmentStatus}
      {order.displayFinancialStatus && " · " + (statuses[order.displayFinancialStatus] ?? order.displayFinancialStatus)}</p>
    {lines && <ul>{lines.map(line => <li key={line.id}>{line.name} · {line.quantity} יח׳</li>)}</ul>}
    {error && <p role="alert">טעינת פריטי ההזמנה נכשלה. אפשר לנסות שוב.</p>}
    {partial && selection && <p role="status">{selection.unavailable.length ? "הפריטים הבאים אינם זמינים להזמנה חוזרת באותו הרכב או בכמות המבוקשת: " + selection.unavailable.join(" · ") : "אין פריטים זמינים להוספה."}</p>}
    <div className={styles.orderActions}>
      <button type="button" className="btn btn-yellow" disabled={busy} onClick={() => {
        if (partial && selection?.items.length) { addMany(selection.items, true); setPartial(false); }
        else void open(true);
      }}>{partial && selection?.items.length ? "הוספת הפריטים הזמינים לסל" : "הזמנה חוזרת"}</button>
      <button type="button" className={styles.textButton} disabled={busy} aria-expanded={!!lines} onClick={() => {
        if (lines) { setLines(null); setPartial(false); } else void open(false);
      }}>{busy ? "טוענים…" : lines ? "הסתרת פריטים" : "פרטי ההזמנה"}</button>
    </div>
  </article>;
}

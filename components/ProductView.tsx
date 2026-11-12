"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { FREE_SHIPPING, phOf, swatchColor, colorLabel, type Product } from "@/lib/catalog";
import { useCatalog } from "@/lib/catalog-context";
import { uniqueColors } from "@/lib/colors";
import { fmt, priceFor, saleBadge } from "@/lib/pricing";
import { complementaryAccessories, similarProducts } from "@/lib/product-recommendations";
import { productColorIndex, productGalleryImages } from "@/lib/product-selection";
import { productSizeOptions, sizeLabel } from "@/lib/sizes";
import { useScrollLock, useStore } from "@/lib/store";
import { IconCheck, IconPhone, IconPin, IconTruck } from "./icons";
import { ProductTile } from "./ProductTile";

function bundleOf(p: Product, extras: Product[]): [string, number][] {
  const q = p.deal ? p.deal[0] : 1;
  const rest = extras.filter((item) => item.id !== p.id).slice(0, 2).map((item) => [item.id, 1] as [string, number]);
  return [[p.id, q], ...rest];
}

export function ProductView({ id, initialColor, initialSize }: { id: string; initialColor?: string; initialSize?: string }) {
  return <ProductDetails key={JSON.stringify([id, initialColor, initialSize])} id={id} initialColor={initialColor} initialSize={initialSize} />;
}

function ProductDetails({ id, initialColor, initialSize }: { id: string; initialColor?: string; initialSize?: string }) {
  const { product, category, products } = useCatalog();
  const p = product(id);
  const accP = useMemo(() => p ? complementaryAccessories(p, products) : [], [p, products]);
  const related = useMemo(() => p ? similarProducts(p, products.filter((item) => !accP.some((accessory) => accessory.id === item.id))) : [], [p, products, accP]);
  const router = useRouter();
  const { addMany, flash, toastOn, cart } = useStore();
  const [color, setColor] = useState(() => p ? productColorIndex(p, initialColor, initialSize) : 0);
  const sizeOptions = useMemo(() => p ? productSizeOptions(p, p.colors[color] || "") : [], [p, color]);
  const [selectedSize, setSize] = useState<string | null>(() => {
    if (initialSize) return sizeOptions.find((option) => option.available && option.label === sizeLabel(initialSize))?.label ?? null;
    return sizeOptions.length === 1 && sizeOptions[0].available ? sizeOptions[0].label : null;
  });
  const selectedOption = sizeOptions.find((option) => option.label === selectedSize && option.available);
  const size = selectedOption?.label ?? null;
  const [qty, setQty] = useState(1);
  const [sizeErr, setSizeErr] = useState(false);
  const [acc, setAcc] = useState<string | null>(() => p?.desc ? "desc" : "spec");
  const [gal, setGal] = useState(0);
  const mobileGallery = useRef<HTMLDivElement>(null);
  const [bOff, setBOff] = useState<Record<string, boolean>>({});
  const [bSize, setBSize] = useState<Record<string, string>>({});
  const [bErr, setBErr] = useState(false);
  const [guide, setGuide] = useState(false);
  useScrollLock(guide);

  if (!p) return null;
  const sizeLabels = sizeOptions.map((option) => option.label);
  const catName = category(p.cat)?.name || "";
  const imgs = productGalleryImages(p, p.colors[color] || "");
  const slides: { kind: "img" | "ph" | "spec"; src?: string; text?: string; rows?: { k: string; v: string }[] }[] = imgs.map((src) => ({ kind: "img", src }));
  if (!imgs.length) slides.push({ kind: "ph", text: p.std ? p.std.join(" · ") : p.sku || catName });
  const specRows = (p.specs || []).map(([k, v]) => ({ k, v }));
  if (specRows.length) slides.push({ kind: "spec", rows: specRows });
  else if (p.std) slides.push({ kind: "spec", rows: [{ k: "תקן", v: p.std.join(" · ") }, { k: "צבע", v: uniqueColors(p.colors).join(", ") }, { k: "מידות", v: sizeLabels.join(", ") }] });
  const gi = Math.min(gal, slides.length - 1);
  const current = slides[gi];

  const inCart = cart.filter((l) => l.pid === p.id).reduce((a, l) => a + l.qty, 0);
  const line = priceFor(p, qty);
  const packs = p.deal
    ? [1, p.deal[0], p.deal[0] * 2].map((n) => {
        const pr = priceFor(p, n);
        const sv = n * p.price - pr;
        return { n, pr, sv, on: qty === n };
      })
    : [];
  let feedback = "";
  let fbColor = "#5E5E5B";
  if (p.deal) {
    const [q, dp] = p.deal;
    const rem = qty % q;
    if (qty < q) feedback = `עוד ${q - qty} יחידות ותשלמו ${dp} ₪ על ${q}`;
    else {
      const sv = qty * p.price - priceFor(p, qty);
      feedback = `${qty} יחידות ב-${fmt(priceFor(p, qty))} · חסכתם ${fmt(sv)}${rem ? ` · עוד ${q - rem} לחבילה נוספת` : ""}`;
      fbColor = "#111";
    }
  }

  const accs = [
    ...(p.desc ? [{ id: "desc", title: "תיאור", lines: p.desc.map((v) => ({ k: "", v: "— " + v })) }] : []),
    {
      id: "spec",
      title: "מפרט",
      lines: [
        ...(p.sku ? [{ k: "מק״ט", v: p.sku }] : []),
        ...(p.brand ? [{ k: "מותג", v: p.brand }] : []),
        { k: "קטגוריה", v: catName },
        ...(p.specs || []).map(([k, v]) => ({ k, v })),
        ...(p.std ? [{ k: "תקן", v: p.std.join(" · ") }] : []),
        { k: "מידות", v: sizeLabels.join(", ") },
      ],
    },
    {
      id: "ship",
      title: "משלוחים והחזרות",
      lines: [
        { k: "", v: `משלוח חינם בהזמנות מעל ${fmt(FREE_SHIPPING)}.` },
        { k: "", v: "אפשר לאסוף מהסניף בהפועלים 20, באר שבע." },
        { k: "", v: "מדיניות ההחזרות המלאה מפורטת בתקנון האתר." },
      ],
    },
  ];

  const items = bundleOf(p, accP);
  const add = () => {
    if (!selectedOption) {
      setSizeErr(true);
      flash("בחרו מידה");
      return;
    }
    addMany([[p.id, color, selectedOption.value, qty]], true);
  };
  const addBundle = () => {
    const sel = bRows.flatMap((row) => row?.on ? [row] : []);
    const miss = sel.some((row) => !row.isMain && !row.option?.available);
    if (!selectedOption || miss) {
      setBErr(miss);
      setSizeErr(!size);
      flash(!size ? "בחרו מידה לפריט הראשי" : "בחרו מידה לכל פריט");
      return;
    }
    setBErr(false);
    addMany(
      sel.map((row) => row.isMain
        ? [p.id, color, selectedOption.value, row.q]
        : [row.item.id, 0, row.option!.value, row.q]),
      true
    );
  };

  let bTotal = 0;
  let bRegular = 0;
  let bCount = 0;
  const bRows = items.map(([pid, q]) => {
    const item = product(pid);
    if (!item) return null;
    const isMain = pid === p.id;
    const on = isMain || !bOff[pid];
    const options = productSizeOptions(item);
    const multi = options.length > 1;
    const chosen = multi ? bSize[pid] || "" : options[0]?.label || "";
    const option = options.find((entry) => entry.label === chosen && entry.available);
    const pr = priceFor(item, q);
    if (on) {
      bTotal += pr;
      bRegular += q * item.price;
      bCount += q;
    }
    return { item, q, isMain, on, multi, chosen, option, options, pr };
  });

  const addBg = toastOn ? "#1F7A3D" : "#111";

  return (
    <main className="wrap has-buybar" style={{ paddingTop: "clamp(0px, 2vw, 24px)" }}>
      <div className="crumbs desk">
        <Link href="/">בית</Link>
        <span>/</span>
        <Link href={`/c/${p.cat}`}>{catName}</Link>
        <span>/</span>
        <span className="now">{p.name}</span>
      </div>
      <div className="pdp">
        <div className="gallery desk">
          <div className="g-side">
            {slides.map((sl, i) => (
              <button key={i} className={`g-thumb ${i === gi ? "on" : ""}`} onClick={() => setGal(i)} aria-label="תמונה">
                {sl.kind === "img" && <img src={sl.src} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", mixBlendMode: "multiply" }} />}
                {sl.kind !== "img" && <span className="k" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, color: "#8a8a86" }}>{sl.kind === "spec" ? "מפרט" : sl.text}</span>}
              </button>
            ))}
          </div>
          <GalleryFrame slide={current} name={p.name} deal={p.deal} was={p.was} price={p.price} />
        </div>
        <div className="mob-block" style={{ position: "relative" }}>
          <div
            key={color}
            ref={mobileGallery}
            className="m-gal scroller"
            onScroll={(e) => {
              const el = e.currentTarget;
              const i = Math.round(Math.abs(el.scrollLeft) / el.clientWidth);
              if (i !== gal) setGal(i);
            }}
          >
            {slides.map((sl, i) => (
              <div className="m-slide" key={i}>
                {sl.kind === "img" && <img src={sl.src} alt={p.name} />}
                {sl.kind === "ph" && <span className="k ph-xl" style={{ fontSize: 96 }}>{sl.text}</span>}
                {sl.kind === "spec" && (
                  <div className="spec-slide" style={{ padding: 24 }}>
                    <span className="k" style={{ fontSize: 60 }}>מפרט</span>
                    {sl.rows?.map((r) => (
                      <div className="spec-row" key={r.k} style={{ fontSize: 15 }}>
                        <span style={{ color: "#bdbdb7" }}>{r.k}</span>
                        <span style={{ fontWeight: 700 }}>{r.v}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="dots">
            {slides.map((_, i) => (
              <i key={i} style={{ width: i === gal ? 20 : 8, opacity: i === gal ? 1 : 0.25 }} />
            ))}
          </div>
          {p.deal && <span className="badge y" style={{ position: "absolute", top: 12, right: 12 }}>{p.deal[0]} ב-{p.deal[1]} ₪</span>}
          <button className="back-fab" aria-label="חזרה" onClick={() => (window.history.length > 1 ? router.back() : router.push(`/c/${p.cat}`))}>
            →
          </button>
        </div>

        <div className="buy">
          <div className="buy-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14, fontWeight: 600 }} className="muted">
              <span>{p.brand || "האחים כהן"}</span>
              <span dir="ltr">{p.sku ? `מק״ט ${p.sku}` : ""}</span>
            </div>
            <h1>{p.name}</h1>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 28, fontWeight: 800 }}>{fmt(p.price)}</span>
              {p.was && <s style={{ fontSize: 18, color: "#8a8a86" }}>{fmt(p.was)}</s>}
            </div>
            {p.std && (
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {p.std.map((t) => (
                  <span key={t} className="badge b">{t}</span>
                ))}
              </div>
            )}
          </div>

          {p.deal && (
            <div className="buy-pad" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>בחרו חבילה</span>
              {packs.map((t) => (
                <button key={t.n} className={`pack ${t.on ? "on" : ""}`} onClick={() => setQty(t.n)}>
                  <span className="radio"><i /></span>
                  <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 16, fontWeight: 800 }}>
                      {t.n === 1 ? "יחידה אחת" : `חבילת ${t.n}`}
                      {t.n > 1 && <span className="badge y" style={{ fontSize: 12 }}>{t.n === p.deal![0] ? "מבצע" : "לצוות"}</span>}
                    </span>
                    <span className="muted" style={{ fontSize: 13 }}>{t.n === 1 ? `${fmt(p.price)} ליחידה` : `${fmt(t.pr / t.n)} ליחידה · חיסכון ${fmt(t.sv)}`}</span>
                  </span>
                  <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                    <span style={{ fontSize: 18, fontWeight: 800 }}>{fmt(t.pr)}</span>
                    {t.sv > 0 && <s style={{ fontSize: 13, color: "#8a8a86" }}>{fmt(t.n * p.price)}</s>}
                  </span>
                </button>
              ))}
              <span style={{ fontSize: 14, fontWeight: 700, color: fbColor, marginTop: 4 }}>{feedback}</span>
            </div>
          )}

          {p.colors.length > 0 && (
            <div className="buy-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 15 }}>
                <b>צבע: </b>
                {colorLabel(p.colors[color] ?? "")}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {p.colors.map((c, i) => (
                  <button key={c} className={`color-dot lg ${i === color ? "on" : "off"}`} style={{ background: swatchColor(c) }} title={colorLabel(c)} aria-label={colorLabel(c)} aria-pressed={i === color} onClick={() => {
                    setColor(i);
                    setGal(0);
                    mobileGallery.current?.scrollTo({ left: 0, behavior: "instant" });
                  }} />
                ))}
              </div>
            </div>
          )}

          <div className="buy-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 15 }}>
              <span>
                <b>מידה: </b>
                {size || "לא נבחרה"}
              </span>
              <button onClick={() => setGuide(true)} style={{ background: "none", border: 0, fontSize: 14, fontWeight: 600, textDecoration: "underline" }}>
                מדריך מידות
              </button>
            </div>
            <div className="size-grid">
              {sizeOptions.map(({ label, available }) => (
                <button type="button" key={label} disabled={!available} aria-pressed={size === label} title={!available ? "המידה אינה זמינה בצבע שנבחר" : undefined} className={`size ${size === label ? "on" : ""} ${sizeErr && available && size !== label ? "err" : ""}`} onClick={() => { setSize(label); setSizeErr(false); }}>
                  {label}
                </button>
              ))}
            </div>
            {sizeErr && <span className="err">יש לבחור מידה לפני ההוספה לסל</span>}
          </div>

          <div className="add-row buy-pad">
            <div className="qty">
              <button onClick={() => setQty((n) => n + 1)} aria-label="הוספת יחידה">+</button>
              <span>{qty}</span>
              <button onClick={() => setQty((n) => Math.max(1, n - 1))} aria-label="הפחתת יחידה">−</button>
            </div>
            <button className="btn desk" style={{ background: addBg }} onClick={add}>
              {size ? `הוספה לסל · ${fmt(line)}` : `בחרו מידה · ${fmt(line)}`}
            </button>
            <span className="stock mob-flex" style={{ alignSelf: "center" }}>
              במלאי{inCart ? ` · ${inCart} כבר בסל` : " · זמין למשלוח"}
            </span>
          </div>
          <div className="stock desk" style={{ marginTop: -8 }}>
            <span className="sq" style={{ background: "#1F7A3D" }} />
            במלאי{inCart ? ` · ${inCart} כבר בסל` : " · זמין למשלוח"}
          </div>

          {accP.length > 0 && <div className="bundle" style={{ marginInline: undefined }}>
            <div className="bundle-h">
              <span style={{ fontSize: 16, fontWeight: 800 }}>השלימו את הסט</span>
              {bRegular - bTotal > 0 && <span className="save-tag y">חיסכון {fmt(bRegular - bTotal)}</span>}
            </div>
            {bRows.map((r) => {
              if (!r) return null;
              const image = r.isMain ? imgs[0] : r.item.imgs?.[0];
              return (
              <div key={r.item.id} className="bundle-row" style={{ opacity: r.on ? 1 : 0.45 }}>
                <button className={`tick ${r.on ? "on" : ""}`} aria-label="בחירה" onClick={() => { if (!r.isMain) setBOff((s) => ({ ...s, [r.item.id]: !s[r.item.id] })); }}>
                  {r.on && <IconCheck />}
                </button>
                <div className="mini-ph">
                  {image ? <img src={image} alt="" /> : <span className="k" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, color: "#bdbdb7" }}>{phOf(r.item)}</span>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{r.item.name}</span>
                    <span style={{ fontSize: 15, fontWeight: 800 }}>{fmt(r.pr)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                    <span className="muted" style={{ fontSize: 13 }}>{r.q > 1 ? `${r.q} יחידות${r.item.deal && r.q >= r.item.deal[0] ? " · מבצע כמות" : ""}` : "יחידה אחת"}</span>
                    {!r.isMain && r.multi && (
                      <select className="plain" style={{ height: 34, minWidth: 84, border: 0, boxShadow: `inset 0 0 0 1px ${bErr && r.on && !r.chosen ? "#B3261E" : "#CFCFCA"}` }} value={r.chosen} onChange={(e) => { setBSize((s) => ({ ...s, [r.item.id]: e.target.value })); setBErr(false); }}>
                        <option value="">מידה</option>
                        {r.options.map((option) => <option key={option.label} value={option.label} disabled={!option.available}>{option.label}</option>)}
                      </select>
                    )}
                    {r.isMain && <span style={{ fontSize: 13, fontWeight: 700, direction: "ltr" }}>{size ? `מידה ${size}` : "בחרו מידה למעלה"}</span>}
                  </div>
                </div>
              </div>
              );
            })}
            <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: 22, fontWeight: 800 }}>{fmt(bTotal)}</span>
                {bRegular - bTotal > 0 && <s style={{ fontSize: 14, color: "#8a8a86" }}>{fmt(bRegular)}</s>}
              </span>
              <button className="btn" style={{ height: 48, padding: "0 20px", fontSize: 15 }} onClick={addBundle}>
                הוספת {bCount} פריטים לסל
              </button>
            </div>
            {bErr && <div style={{ padding: "0 16px 14px" }} className="err">בחרו מידה לכל פריט מסומן בסט</div>}
          </div>}

          <div className="ship-list buy-pad">
            <div><IconTruck /><div><b>משלוח עד הבית</b> · חינם בהזמנה מעל {fmt(FREE_SHIPPING)}</div></div>
            <div><IconPin /><div><b>סניף באר שבע</b> · הפועלים 20 — אפשר להגיע ולמדוד</div></div>
            <div><IconPhone /><div><b>התלבטות במידה?</b> · <a href="tel:08-6233803" style={{ textDecoration: "underline" }}>08-6233803</a></div></div>
          </div>
          <div className="buy-pad">
            {accs.map((a) => (
              <div className="acc" key={a.id}>
                <button onClick={() => setAcc((cur) => (cur === a.id ? null : a.id))}>
                  {a.title}
                  <span style={{ fontSize: 22, fontWeight: 400 }}>{acc === a.id ? "−" : "+"}</span>
                </button>
                {acc === a.id && (
                  <div style={{ padding: "0 0 20px", display: "flex", flexDirection: "column", gap: 8, fontSize: 15, lineHeight: 1.6 }}>
                    {a.lines.map((ln, i) => (
                      <div key={i} style={{ display: "grid", gridTemplateColumns: ln.k ? "110px 1fr" : "1fr", gap: 12 }}>
                        {ln.k && <span className="muted">{ln.k}</span>}
                        <span>{ln.v}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {(related.length > 0 || accP.length > 0) && (
        <div className="pdp-recommendations">
          {related.length > 0 && (
            <section className="pdp-recommendation-section" aria-labelledby="related-products-title">
              <div className="pdp-recommendation-head">
                <h2 className="k" id="related-products-title">עוד מהקטגוריה</h2>
                {category(p.cat) && <Link href={`/c/${p.cat}`} className="pdp-recommendation-link">לכל מוצרי הקטגוריה <span aria-hidden="true">←</span></Link>}
              </div>
              <div className="product-grid pdp-recommendation-grid">
                {related.map((x) => <ProductTile key={x.id} p={x} />)}
              </div>
            </section>
          )}
          {accP.length > 0 && (
            <section className="pdp-recommendation-section" aria-labelledby="accessory-products-title">
              <div className="pdp-recommendation-head">
                <h2 className="k" id="accessory-products-title">אביזרים משלימים</h2>
              </div>
              <div className="product-grid pdp-recommendation-grid">
                {accP.map((x) => <ProductTile key={x.id} p={x} />)}
              </div>
            </section>
          )}
        </div>
      )}

      <div className="buybar mob-flex">
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0, paddingInlineStart: 4 }}>
          <span style={{ fontSize: 18, fontWeight: 800 }}>{fmt(line)}</span>
          <span className="muted" style={{ fontSize: 12, fontWeight: 600 }}>{qty} יח׳{size ? ` · ${size}` : ""}</span>
        </div>
        <button className="btn" style={{ background: addBg }} onClick={add}>{size ? "הוספה לסל" : "בחרו מידה"}</button>
      </div>

      {guide && (
        <>
          <div className="backdrop on" onClick={() => setGuide(false)} />
          <section className="sheet" aria-label="מדריך מידות">
            <div className="sheet-h">
              <span style={{ fontSize: 18, fontWeight: 800 }}>מדריך מידות</span>
              <button className="x" onClick={() => setGuide(false)} aria-label="סגירה">×</button>
            </div>
            <div className="sheet-b">
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.65 }}>
                המידות הזמינות לפריט: <b style={{ direction: "ltr", display: "inline-block" }}>{sizeLabels.join(" · ")}</b>. כך מודדים לפני שבוחרים:
              </p>
              <div style={{ display: "flex", flexDirection: "column", borderTop: "2px solid #111" }}>
                <div style={{ display: "grid", gridTemplateColumns: "44px 1fr", padding: "14px 0", borderBottom: "1px solid #E4E4E1", fontSize: 15, lineHeight: 1.55 }}><span className="k" style={{ fontSize: 32 }}>01</span><span><b>היקף חזה</b> — מודדים בנקודה הרחבה ביותר, מתחת לבתי השחי.</span></div>
                <div style={{ display: "grid", gridTemplateColumns: "44px 1fr", padding: "14px 0", borderBottom: "1px solid #E4E4E1", fontSize: 15, lineHeight: 1.55 }}><span className="k" style={{ fontSize: 32 }}>02</span><span><b>אורך</b> — מהתפר העליון בכתף ועד שולי הבגד, על בגד קיים שמתאים לכם.</span></div>
                <div style={{ display: "grid", gridTemplateColumns: "44px 1fr", padding: "14px 0", borderBottom: "1px solid #E4E4E1", fontSize: 15, lineHeight: 1.55 }}><span className="k" style={{ fontSize: 32 }}>03</span><span><b>בין שתי מידות?</b> לעבודה פיזית ולשכבות מתחת — עדיף לבחור את הגדולה.</span></div>
              </div>
              <a href="tel:08-6233803" className="btn btn-line" style={{ height: 54, fontSize: 15 }}>ייעוץ מידות בטלפון · 08-6233803</a>
            </div>
          </section>
        </>
      )}
    </main>
  );
}

function GalleryFrame({ slide, name, deal, was, price }: { slide: { kind: string; src?: string; text?: string; rows?: { k: string; v: string }[] }; name: string; deal?: [number, number]; was?: number; price: number }) {
  return (
    <div className="g-main">
      {slide.kind === "img" && <img src={slide.src} alt={name} />}
      {slide.kind === "ph" && <span className="k ph-xl">{slide.text}</span>}
      {slide.kind === "spec" && (
        <div className="spec-slide">
          <span className="k">מפרט</span>
          {slide.rows?.map((r) => (
            <div className="spec-row" key={r.k}>
              <span style={{ color: "#bdbdb7" }}>{r.k}</span>
              <span style={{ fontWeight: 700 }}>{r.v}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ position: "absolute", top: 12, right: 12, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
        {deal && <span className="badge y">{deal[0]} ב-{deal[1]} ₪</span>}
        {was && <span className="badge b">{saleBadge({ price, was } as Product)}</span>}
      </div>
    </div>
  );
}

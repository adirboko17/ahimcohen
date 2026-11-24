"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { heroImageTarget, type AdminHero, type AdminHeroImage, type HeroDevice, type HeroTarget } from "@/lib/admin/models";
import type { Category } from "@/lib/catalog";
import { AdminForm, AdminProductField } from "./AdminControls";
import { IconUpload } from "./icons";

export function AdminHeroEditor({ hero, published, categories, returnTo }: {
  hero?: AdminHero; published: boolean; categories: Pick<Category, "id" | "name">[]; returnTo: string;
}) {
  return <AdminForm section="heroes" id={hero?.id} returnTo={returnTo}
    footerActions={<Link href={returnTo} className="btn btn-line" prefetch={false}>ביטול</Link>}>
    <div className="admin-hero-files">
      <HeroImageField name="desktop" label="תמונה למחשב" image={hero?.desktop} target={heroImageTarget(hero, "desktop")} categories={categories} />
      <HeroImageField name="mobile" label="תמונה למובייל" image={hero?.mobile} target={heroImageTarget(hero, "mobile")} categories={categories} />
    </div>
    <p className="admin-hint">עד 4MB לתמונה. אם בוחרים תמונה אחת, היא והקישור שלה ישמשו גם במחשב וגם במובייל.</p>
    <label className="admin-check">
      <span>הצגה בדף הבית</span><input type="checkbox" name="published" defaultChecked={published} />
    </label>
  </AdminForm>;
}

function HeroImageField({ name, label, image, target, categories }: {
  name: HeroDevice; label: string; image?: AdminHeroImage; target: HeroTarget | null; categories: Pick<Category, "id" | "name">[];
}) {
  const [preview, setPreview] = useState("");
  const [removed, setRemoved] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const source = preview || (!removed ? image?.src : undefined);

  return <fieldset className="admin-hero-device" data-device={name}>
    <legend>{label}</legend>
    <label className="admin-hero-picker">
      {source && <img src={source} alt="" />}
      <span><IconUpload />{source ? "החלפת תמונה" : "בחירת תמונה"}</span>
      <input ref={fileInput} type="file" name={name} accept="image/jpeg,image/png,image/webp,image/avif"
        aria-label={`${source ? "החלפת" : "בחירת"} ${label}`} onChange={(event) => {
          const file = event.target.files?.[0];
          setPreview(file ? URL.createObjectURL(file) : "");
        }} />
    </label>
    {removed && <input type="hidden" name={`${name}Remove`} value="1" />}
    {source && <>
      <button className="admin-hero-image-remove" type="button" onClick={() => {
        if (fileInput.current) fileInput.current.value = "";
        setPreview("");
        setRemoved(true);
      }}>הסרת תמונה</button>
      <HeroTargetField name={name} target={removed ? null : target} categories={categories} />
    </>}
  </fieldset>;
}

function HeroTargetField({ name, target, categories }: {
  name: HeroDevice; target: HeroTarget | null; categories: Pick<Category, "id" | "name">[];
}) {
  const [kind, setKind] = useState(target?.kind ?? "none");
  const targetId = target?.kind === kind && target.kind !== "link" ? target.id : "";
  return <div className="admin-hero-destination">
    <label className="field">יעד בלחיצה
      <select name={`${name}Target`} value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
        <option value="none">ללא קישור</option>
        <option value="link">קישור</option>
        <option value="category">קטגוריה מהאתר</option>
        <option value="product">מוצר מהאתר</option>
      </select>
    </label>
    {kind === "link" && <label className="field">כתובת הקישור
      <input name={`${name}Href`} dir="ltr" maxLength={2048} placeholder="https://… או /offers"
        defaultValue={target?.kind === "link" ? target.href : undefined} required />
    </label>}
    {kind === "category" && <label className="field">קטגוריה
      <select name={`${name}TargetId`} defaultValue={targetId} required>
        <option value="" disabled>בחרו קטגוריה</option>
        {categories.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
      </select>
    </label>}
    {kind === "product" && <AdminProductField name={`${name}TargetId`} initialId={targetId} />}
  </div>;
}

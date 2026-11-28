"use client";

import { useEffect, useRef, useState } from "react";
import { IconPlus, IconTrash, IconUpload } from "@/components/icons";
import { galleryLimit, imageByteLimit, productImageTypes } from "@/lib/product-gallery";

function Photo({ file }: { file: File }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return src ? <img src={src} alt={file.name} /> : null;
}

export function ProductGalleryPicker({ photos, onChange, disabled }: { photos: File[]; onChange: (files: File[]) => void; disabled: boolean }) {
  const picker = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  function add(files: FileList | null) {
    if (!files || disabled) return;
    const next = [...photos];
    const issues: string[] = [];
    for (const file of Array.from(files)) {
      if (!file.size || !productImageTypes.includes(file.type) || file.size > imageByteLimit) {
        issues.push(`הקובץ ${file.name} אינו נתמך. בחרו תמונה בגודל של עד 4MB בפורמט המצוין.`);
      } else if (next.some(existing => existing.name === file.name && existing.size === file.size && existing.lastModified === file.lastModified)) {
        issues.push(`התמונה ${file.name} כבר נוספה.`);
      } else if (next.length === galleryLimit) {
        issues.push(`אפשר להוסיף עד ${galleryLimit} תמונות למוצר.`);
        break;
      } else next.push(file);
    }
    setError(issues.join(" "));
    onChange(next);
  }
  return <section className="np-card np-gallery" aria-labelledby="np-gallery-title"
    onDragOver={event => { event.preventDefault(); if (!disabled) setDragging(true); }}
    onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
    onDrop={event => { event.preventDefault(); setDragging(false); add(event.dataTransfer.files); }} data-dragging={dragging}>
    <header className="np-card-heading"><h2 id="np-gallery-title">גלריית תמונות</h2><span className="np-count">{photos.length} / {galleryLimit}</span></header>
    <input ref={picker} type="file" multiple accept={productImageTypes.join(",")} hidden aria-label="בחירת תמונות למוצר"
      onChange={event => { add(event.target.files); event.target.value = ""; }} />
    {photos.length > 0 && <ul className="np-photos">
      {photos.map((file, index) => <li key={JSON.stringify([file.name, file.size, file.lastModified])}>
        <Photo file={file} />
        <button className="np-remove-photo" type="button" aria-label={`הסרת ${file.name}`} title="הסרה" onClick={() => { onChange(photos.filter(photo => photo !== file)); setError(""); }}><IconTrash /></button>
        {index === 0 ? <span className="np-cover-label">ראשית</span>
          : <button className="np-cover-button" type="button" onClick={() => onChange([file, ...photos.filter(photo => photo !== file)])}>הגדרה כראשית</button>}
      </li>)}
    </ul>}
    {photos.length < galleryLimit && <button type="button" className={photos.length ? "np-add-photos" : "np-drop"} onClick={() => picker.current?.click()}>
      <span className="np-upload-icon">{photos.length ? <IconPlus size={18} /> : <IconUpload />}</span>
      <strong>{photos.length ? "הוספת תמונות" : "בחירת תמונות או גרירה לכאן"}</strong>
      {!photos.length && <small>JPG, PNG או WebP · עד 4MB לתמונה</small>}
    </button>}
    {error && <p role="alert" className="np-error">{error}</p>}
  </section>;
}

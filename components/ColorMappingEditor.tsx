"use client";

import { useState } from "react";
import { colorFamilies, colorFamilyIds, isColorFamily } from "@/lib/color-families";
import type { ColorReviewItem, ColorSuggestion } from "@/lib/admin/color-review";
import { AdminForm } from "./AdminControls";

export function ColorMappingEditor({ item, suggestion, returnTo }: {
  item: ColorReviewItem; suggestion?: ColorSuggestion | null; returnTo: string;
}) {
  const initial = item.approved ?? suggestion;
  const [family, setFamily] = useState<string>(initial?.family ?? "");
  const [swatch, setSwatch] = useState(initial?.swatch.toLowerCase() ?? "#8a8b8d");
  const [pending, setPending] = useState(false);

  return <div className="admin-color-editor">
    {!item.approved && (suggestion
      ? <p className="admin-color-suggestion"><span aria-hidden="true" style={{ background: suggestion.swatch }} />
        {suggestion.source === "photo" ? "הצעה לפי תמונת הווריאנט" : "הצעה לפי השם"} · {colorFamilies[suggestion.family].label}
      </p>
      : <p className="admin-color-suggestion muted">בחרו משפחה וגוון לפי דוגמת המוצר.</p>)}
    <AdminForm section="colors" id={item.key} returnTo={returnTo} submitLabel={item.approved ? "עדכון מיפוי" : "אישור צבע"}
      onPendingChange={setPending}
      footerActions={item.approved && <button type="submit" name="operation" value="reset" className="btn btn-line" disabled={pending}>איפוס מיפוי</button>}>
      <div className="admin-color-fields">
        <label className="field">משפחת צבע
          <select name="family" value={family} required disabled={pending} onChange={event => {
            const next = event.currentTarget.value;
            setFamily(next);
            if (isColorFamily(next)) setSwatch(colorFamilies[next].swatch.toLowerCase());
          }}>
            <option value="" disabled>בחרו משפחה</option>
            {colorFamilyIds.map(id => <option key={id} value={id}>{colorFamilies[id].label}</option>)}
          </select>
        </label>
        {family === "multicolor" ? <input type="hidden" name="swatch" value={colorFamilies.multicolor.swatch} />
          : <label className="field">דוגמית צבע
            <span className="admin-color-swatch-field">
              <input type="color" name="swatch" value={swatch} disabled={pending} onChange={event => setSwatch(event.currentTarget.value)} />
              <bdi>{swatch.toUpperCase()}</bdi>
            </span>
          </label>}
      </div>
    </AdminForm>
  </div>;
}

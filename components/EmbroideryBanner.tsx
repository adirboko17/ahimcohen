"use client";

import { createElement, useEffect, useRef, useState } from "react";

export function EmbroideryBanner() {
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let active = true;
    const load = async () => {
      try {
        const { registerEmbroidery } = await import("@/lib/embroidery-animation");
        if (!active) return;
        registerEmbroidery();
        setReady(true);
      } catch {
        // Keep the static logo if the optional animation chunk cannot load.
      }
    };
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      void load();
    }, { rootMargin: "200px" });
    observer.observe(element);
    return () => { active = false; observer.disconnect(); };
  }, []);

  return (
    <div ref={host} className="b2b-embroidery">
      <div className="b2b-embroidery-art" role="img" aria-label="הדמיית לוגואים לדוגמה הנרקמים בחוט צהוב ולבן על בד כהה">
        {ready
          ? createElement("emb-stitch", { "aria-hidden": "true" })
          : <span className="k b2b-embroidery-placeholder" aria-hidden="true">הלוגו שלכם.</span>}
      </div>
    </div>
  );
}

let frozenPosition: { x: number; y: number } | null = null;
let lockCount = 0;
let restorePage: (() => void) | null = null;

export function pageScrollPosition() {
  return frozenPosition ?? { x: window.scrollX, y: window.scrollY };
}

/** Freeze the page behind overlays, retaining its position until they close. */
export function lockPageScroll(): () => void {
  if (lockCount++ === 0) restorePage = freezePage();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--lockCount === 0) {
      const restore = restorePage;
      restorePage = null;
      restore?.();
    }
  };
}

function freezePage(): () => void {
  const body = document.body;
  const mobile = window.matchMedia("(max-width: 767px)").matches;
  const x = window.scrollX;
  const y = window.scrollY;
  const url = window.location.href;
  const properties = mobile ? ["overflow", "position", "top", "left", "width"] : ["overflow"];
  const previous = properties.map((property) => ({
    property,
    value: body.style.getPropertyValue(property),
    priority: body.style.getPropertyPriority(property),
  }));

  body.style.setProperty("overflow", "hidden");
  if (mobile) {
    frozenPosition = { x, y };
    body.style.setProperty("position", "fixed");
    body.style.setProperty("top", `${-y}px`);
    body.style.setProperty("left", `${-x}px`);
    body.style.setProperty("width", "100%");
  }

  return () => {
    if (mobile) frozenPosition = null;
    for (const { property, value, priority } of previous) {
      if (value) body.style.setProperty(property, value, priority);
      else body.style.removeProperty(property);
    }
    // A menu/search result may have navigated away. Leave that route's
    // scroll position to the router rather than restoring the old page.
    if (mobile && window.location.href === url) {
      window.scrollTo({ left: x, top: y, behavior: "instant" });
    }
  };
}

// The mobile track is RTL. Advance in pixels, rather than jumping between cards.
export function brandLoopLength(element: HTMLElement) {
  const first = element.querySelector<HTMLElement>(".brand-card");
  const copy = element.querySelector<HTMLElement>(".brand-card-loop-copy");
  return first && copy ? Math.abs(first.offsetLeft - copy.offsetLeft) : 0;
}

export function startBrandAutoplay(element: HTMLElement) {
  return startLoopAutoplay(element, brandLoopLength, "(max-width: 767px)");
}

export function startLoopAutoplay(
  element: HTMLElement,
  loopLength: (element: HTMLElement) => number,
  viewport = "(min-width: 0px)",
) {
  const screen = window.matchMedia(viewport);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let visible = false;
  let stopped = false;
  let frame = 0;
  let previous = 0;
  let position = Math.abs(element.scrollLeft);
  let interacting = false;
  let keyboardFocus = false;
  let touching = false;
  const pointers = new Set<number>();
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const clearIdle = () => { clearTimeout(idleTimer); idleTimer = undefined; };
  const cancel = () => { cancelAnimationFrame(frame); frame = 0; previous = 0; };
  const canMove = () => !stopped && !interacting && visible && screen.matches && !reducedMotion.matches && !document.hidden;
  const tick = (now: number) => {
    frame = 0;
    if (!canMove()) return;
    const elapsed = previous ? Math.min(now - previous, 64) / 1000 : 0;
    if (!previous) position = Math.abs(element.scrollLeft);
    previous = now;
    const max = element.scrollWidth - element.clientWidth;
    const cycle = loopLength(element);
    if (max > 1 && cycle > 0) {
      // Keep fractional pixels between frames; scrollLeft may be rounded by
      // the browser. The duplicate set makes this rebase visually identical.
      position = (position + 24 * elapsed) % cycle;
      element.scrollTo({ left: -position, behavior: "instant" });
    }
    frame = requestAnimationFrame(tick);
  };
  const sync = () => {
    if (!canMove()) cancel();
    else if (!frame) { previous = 0; frame = requestAnimationFrame(tick); }
  };
  const scheduleResume = () => {
    clearIdle();
    if (stopped || touching || pointers.size || keyboardFocus) return;
    idleTimer = setTimeout(() => {
      idleTimer = undefined;
      if (stopped) return;
      interacting = false;
      sync();
    }, 6000);
  };
  const interact = () => {
    if (stopped) return;
    interacting = true;
    cancel();
    scheduleResume();
  };
  const pointerDown = (event: PointerEvent) => { pointers.add(event.pointerId); interact(); };
  const pointerUp = (event: PointerEvent) => { if (pointers.delete(event.pointerId)) interact(); };
  const touchStart = () => { touching = true; interact(); };
  const touchEnd = (event: TouchEvent) => { if (touching) { touching = event.touches.length > 0; interact(); } };
  const scroll = () => { if (interacting) scheduleResume(); };
  const focusIn = (event: FocusEvent) => { keyboardFocus = !!(event.target as HTMLElement)?.matches?.(":focus-visible"); interact(); };
  const focusOut = (event: FocusEvent) => { if (!element.contains(event.relatedTarget as Node | null)) { keyboardFocus = false; interact(); } };
  const keyDown = () => { keyboardFocus = true; interact(); };
  const blur = () => { pointers.clear(); touching = false; keyboardFocus = false; interact(); };
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting && entry.intersectionRatio >= .25;
    sync();
  }, { threshold: [.25] });
  observer.observe(element);
  element.addEventListener("pointerdown", pointerDown, { passive: true });
  element.addEventListener("touchstart", touchStart, { passive: true });
  element.addEventListener("wheel", interact, { passive: true });
  element.addEventListener("scroll", scroll, { passive: true });
  element.addEventListener("focusin", focusIn);
  element.addEventListener("focusout", focusOut);
  element.addEventListener("keydown", keyDown);
  document.addEventListener("pointerup", pointerUp, { passive: true });
  document.addEventListener("pointercancel", pointerUp, { passive: true });
  document.addEventListener("touchend", touchEnd, { passive: true });
  document.addEventListener("touchcancel", touchEnd, { passive: true });
  window.addEventListener("blur", blur);
  document.addEventListener("visibilitychange", sync);
  screen.addEventListener("change", sync);
  reducedMotion.addEventListener("change", sync);
  const stop = () => {
    stopped = true;
    cancel();
    clearIdle();
    observer.disconnect();
    element.removeEventListener("pointerdown", pointerDown);
    element.removeEventListener("touchstart", touchStart);
    element.removeEventListener("wheel", interact);
    element.removeEventListener("scroll", scroll);
    element.removeEventListener("focusin", focusIn);
    element.removeEventListener("focusout", focusOut);
    element.removeEventListener("keydown", keyDown);
    document.removeEventListener("pointerup", pointerUp);
    document.removeEventListener("pointercancel", pointerUp);
    document.removeEventListener("touchend", touchEnd);
    document.removeEventListener("touchcancel", touchEnd);
    window.removeEventListener("blur", blur);
    document.removeEventListener("visibilitychange", sync);
    screen.removeEventListener("change", sync);
    reducedMotion.removeEventListener("change", sync);
  };
  return { stop, interact };
}

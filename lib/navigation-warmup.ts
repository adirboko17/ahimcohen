type Connection = { saveData?: boolean; effectiveType?: string };
type Prefetch = (href: string) => void;

// Keep this supplemental full-route prefetch small. Next Link still handles
// ordinary navigation/partial prefetch; images are left to their lazy loaders.
const BACKGROUND_LIMIT = 4;
const INTENT_LIMIT = 8;
const REUSE_MS = 60_000;

export function publicNavigationHref(href: string, current: string): string | null {
  try {
    const url = new URL(href, current);
    const here = new URL(current);
    if (url.origin !== here.origin || !/^https?:$/.test(url.protocol)) return null;
    if (!/^\/(?:c\/[^/]+|p\/[^/]+|brands(?:\/[^/]+)?|offers|quantity-offers)\/?$/.test(url.pathname)) return null;
    if (url.pathname === here.pathname && url.search === here.search) return null;
    return url.pathname + url.search;
  } catch {
    return null;
  }
}

export function startNavigationWarmup(prefetch: Prefetch, warmed: Map<string, number>) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let idle: number | undefined;
  let backgroundCount = 0;
  let intentCount = 0;
  const connection = (navigator as Navigator & { connection?: Connection }).connection;
  const allowed = () => !document.hidden && navigator.onLine !== false &&
    !connection?.saveData && !/^(slow-2g|2g|3g)$/.test(connection?.effectiveType ?? "");

  function warm(anchor: HTMLAnchorElement) {
    if (anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self") ||
      anchor.closest('[aria-hidden="true"], [inert]')) return false;
    const href = publicNavigationHref(anchor.href, window.location.href);
    if (!href) return false;
    const now = Date.now();
    for (const [key, time] of warmed) if (now - time >= REUSE_MS) warmed.delete(key);
    if (warmed.has(href)) return false;
    // Bound the bookkeeping across a long browsing session as well.
    if (warmed.size >= 40) warmed.delete(warmed.keys().next().value!);
    warmed.set(href, now);
    try {
      prefetch(href);
    } catch {
      warmed.delete(href); // Navigation must remain usable if speculative work fails.
    }
    return true;
  }

  function tick() {
    if (stopped || backgroundCount >= BACKGROUND_LIMIT) return;
    if (allowed()) {
      const anchors = [...document.querySelectorAll<HTMLAnchorElement>('main a[href]')]
        .filter(anchor => anchor.getClientRects().length > 0);
      const visible = anchors.filter(anchor => {
        const rect = anchor.getBoundingClientRect();
        return rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
      });
      // Prioritize what's on screen, then a small look-ahead in the current page.
      for (const anchor of [...new Set([...visible, ...anchors])]) {
        if (warm(anchor)) { backgroundCount++; break; }
      }
    }
    // A finite window: don't poll forever on pages without eligible links.
    attempts++;
    if (attempts < BACKGROUND_LIMIT && backgroundCount < BACKGROUND_LIMIT) schedule(1200);
  }

  let attempts = 0;
  function schedule(delay: number) {
    timer = setTimeout(() => {
      if (stopped) return;
      if (window.requestIdleCallback) idle = window.requestIdleCallback(tick, { timeout: 2000 });
      else tick();
    }, delay);
  }

  function onIntent(event: Event) {
    if (stopped || !allowed() || intentCount >= INTENT_LIMIT) return;
    const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
    if (anchor && warm(anchor)) intentCount++;
  }

  const start = () => schedule(1800);
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
  document.addEventListener("pointerover", onIntent, { passive: true });
  document.addEventListener("touchstart", onIntent, { passive: true });
  document.addEventListener("focusin", onIntent);
  return () => {
    stopped = true;
    clearTimeout(timer);
    if (idle !== undefined) window.cancelIdleCallback?.(idle);
    window.removeEventListener("load", start);
    document.removeEventListener("pointerover", onIntent);
    document.removeEventListener("touchstart", onIntent);
    document.removeEventListener("focusin", onIntent);
  };
}

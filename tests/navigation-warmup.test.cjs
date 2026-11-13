const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const ts = require('typescript');
const code = ts.transpileModule(readFileSync('lib/navigation-warmup.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness({ ready = 'complete', connection = {}, hidden = false } = {}) {
  const timers = new Map(), listeners = new Map(), calls = [];
  let sequence = 0;
  class Anchor {
    constructor(path) { this.href = new URL(path, 'https://shop.test').href; this.target = ''; }
    hasAttribute() { return false; }
    closest(selector) { return selector === 'a[href]' ? this : null; }
    getClientRects() { return [this.getBoundingClientRect()]; }
    getBoundingClientRect() { return { top: 100, bottom: 200, left: 10, right: 200 }; }
  }
  const anchors = Array.from({ length: 20 }, (_, i) => new Anchor(`/p/item-${i}`));
  const events = {
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name, fn) => { if (listeners.get(name) === fn) listeners.delete(name); },
  };
  const document = { ...events, readyState: ready, hidden, querySelectorAll: () => anchors };
  const window = { ...events, location: { href: 'https://shop.test/c/shoes' }, innerHeight: 844, innerWidth: 390 };
  const navigator = { onLine: true, connection };
  const loaded = { exports: {} };
  new Function('module', 'exports', 'window', 'document', 'navigator', 'Element', 'URL', 'setTimeout', 'clearTimeout', code)(
    loaded, loaded.exports, window, document, navigator, Anchor, URL,
    (fn) => { timers.set(++sequence, fn); return sequence; }, id => timers.delete(id),
  );
  const warmed = new Map();
  const stop = loaded.exports.startNavigationWarmup(href => calls.push(href), warmed);
  const drain = () => { for (let i = 0; timers.size && i < 20; i++) {
    const [id, fn] = timers.entries().next().value; timers.delete(id); fn();
  } };
  return { ...loaded.exports, calls, warmed, document, navigator, window, anchors, listeners, timers, stop, drain, Anchor };
}

test('prepares only four distinct routes after load, rather than downloading the entire catalog', () => {
  const h = harness({ ready: 'loading' });
  h.drain(); assert.deepEqual(h.calls, []);
  h.listeners.get('load')(); h.drain();
  assert.deepEqual(h.calls, ['/p/item-0', '/p/item-1', '/p/item-2', '/p/item-3']);
  h.stop(); assert.equal(h.listeners.size, 0);
});

test('prioritizes viewport links and ignores hidden duplicates', () => {
  const h = harness();
  h.anchors[0].getClientRects = () => [];
  h.anchors[1].getBoundingClientRect = () => ({ top: 1000, bottom: 1100, left: 10, right: 200 });
  h.drain(); assert.equal(h.calls[0], '/p/item-2');
  assert.ok(!h.calls.includes('/p/item-0'));
});

test('never warms external URLs, checkout, APIs, downloads or current pages', () => {
  const h = harness();
  for (const href of ['https://other.test/p/x', '/checkout', '/api/shopify/cart', '/account', 'javascript:alert(1)', '/c/shoes#top']) {
    assert.equal(h.publicNavigationHref(href, h.window.location.href), null, href);
  }
  assert.equal(h.publicNavigationHref('/p/test?color=black#top', h.window.location.href), '/p/test?color=black');
  h.anchors[0].hasAttribute = () => true;
  h.drain(); assert.ok(!h.calls.includes('/p/item-0'));
});

test('supplemental background and intent requests respect data saver, slow networks, offline and hidden tabs', () => {
  for (const options of [{ connection: { saveData: true } }, { connection: { effectiveType: '3g' } }, { hidden: true }]) {
    const h = harness(options); h.drain();
    h.listeners.get('focusin')({ target: h.anchors[0] });
    assert.equal(h.calls.length, 0);
  }
  const h = harness(); h.navigator.onLine = false; h.drain(); assert.equal(h.calls.length, 0);
});

test('intent prepares a link once, expires bookkeeping, caps requests and cancels on navigation', () => {
  const h = harness(); const intent = () => h.listeners.get('touchstart')({ target: h.anchors[0] });
  intent(); intent(); assert.equal(h.calls.length, 1);
  h.warmed.set('/p/item-0', Date.now() - 61000); intent(); assert.equal(h.calls.length, 2);
  for (const anchor of h.anchors) h.listeners.get('pointerover')({ target: anchor });
  assert.equal(h.calls.length, 8);
  h.stop(); h.drain(); assert.equal(h.calls.length, 8); assert.equal(h.listeners.size, 0);
});

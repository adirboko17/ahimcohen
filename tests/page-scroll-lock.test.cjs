const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const ts = require("typescript");

const code = ts.transpileModule(readFileSync("lib/page-scroll-lock.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness(mobile = true) {
  const values = new Map();
  const style = {
    getPropertyValue: (key) => values.get(key)?.value ?? "",
    getPropertyPriority: (key) => values.get(key)?.priority ?? "",
    setProperty: (key, value, priority = "") => values.set(key, { value, priority }),
    removeProperty: (key) => values.delete(key),
  };
  const calls = [];
  const win = {
    scrollX: 0, scrollY: 1247.5,
    location: { href: "https://shop.example/c/workwear" },
    matchMedia: () => ({ matches: mobile }),
    scrollTo(options) {
      calls.push(options);
      this.scrollX = options.left;
      this.scrollY = options.top;
      assert.notEqual(style.getPropertyValue("position"), "fixed", "release body before restoring scroll");
    },
  };
  const exports = {};
  new Function("exports", "window", "document", code)(exports, win, { body: { style } });
  return { ...exports, win, style, values, calls };
}

test("mobile close restores exact position instantly after viewport/keyboard scrolling", () => {
  const h = harness();
  const release = h.lockPageScroll();
  assert.equal(h.style.getPropertyValue("position"), "fixed");
  assert.equal(h.style.getPropertyValue("top"), "-1247.5px");
  h.win.scrollY = 0;
  assert.deepEqual(h.pageScrollPosition(), { x: 0, y: 1247.5 }, "category history must retain the visible position while fixed");
  h.win.scrollY = 180;
  release();
  assert.deepEqual(h.calls, [{ left: 0, top: 1247.5, behavior: "instant" }]);
  assert.equal(h.values.size, 0, "no fixed body styles remain after closing");
  h.win.scrollY = 1500;
  assert.equal(h.pageScrollPosition().y, 1500);
});

test("cleanup preserves existing inline styles and priorities", () => {
  const h = harness();
  h.style.setProperty("overflow", "clip", "important");
  h.style.setProperty("position", "relative");
  h.style.setProperty("width", "95%");
  h.style.setProperty("color", "red");
  const original = new Map(h.values);
  h.lockPageScroll()();
  assert.deepEqual(h.values, original);
});

test("following a menu/search link never restores the previous route's scroll", () => {
  const h = harness();
  const release = h.lockPageScroll();
  h.win.location.href = "https://shop.example/p/shirt";
  h.win.scrollY = 0;
  release();
  assert.equal(h.calls.length, 0);
  assert.equal(h.values.size, 0);
  assert.equal(h.pageScrollPosition().y, 0);
});

test("rapid close/reopen retains position and repeated cleanup cannot undo a new lock", () => {
  const h = harness();
  const release = h.lockPageScroll();
  release();
  const releaseAgain = h.lockPageScroll();
  release();
  assert.equal(h.style.getPropertyValue("position"), "fixed");
  assert.equal(h.calls.length, 1);
  releaseAgain();
  assert.equal(h.win.scrollY, 1247.5);
  assert.equal(h.values.size, 0);
});

test("desktop keeps its existing overflow lock without fixing or scrolling the page", () => {
  const h = harness(false);
  const release = h.lockPageScroll();
  assert.equal(h.style.getPropertyValue("overflow"), "hidden");
  assert.equal(h.style.getPropertyValue("position"), "");
  release();
  assert.equal(h.calls.length, 0);
  assert.equal(h.values.size, 0);
});

test("overlapping filter/cart locks restore once, only after the last overlay closes", () => {
  for (const closeFilterFirst of [true, false]) {
    const h = harness();
    const filter = h.lockPageScroll();
    h.win.scrollY = 0;
    const cart = h.lockPageScroll();
    assert.equal(h.style.getPropertyValue("top"), "-1247.5px", "second overlay must not capture the fixed body's zero position");
    const [first, last] = closeFilterFirst ? [filter, cart] : [cart, filter];
    first();
    assert.equal(h.calls.length, 0);
    assert.equal(h.style.getPropertyValue("position"), "fixed");
    assert.equal(h.pageScrollPosition().y, 1247.5);
    last();
    assert.deepEqual(h.calls, [{ left: 0, top: 1247.5, behavior: "instant" }]);
    assert.equal(h.values.size, 0);
  }
});

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const ts = require("typescript");
const code = ts.transpileModule(readFileSync("components/Overlays.tsx", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

function harness(animated = true) {
  const slots = [], timers = new Map();
  let cursor = 0, id = 0, time = 0, locked = false;
  const state = { cartOpen: true, menuOpen: false, searchOpen: false, sheet: null, cart: [], pricing: {}, cartQuote: {}, closeAll() {} };
  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], (value) => { slots[index] = value; }];
    },
    useEffect(fn, deps) {
      const index = cursor++;
      const previous = slots[index];
      if (previous && deps.every((dep, i) => Object.is(dep, previous.deps[i]))) return;
      previous?.cleanup?.();
      slots[index] = { deps, cleanup: fn() };
    },
  };
  const exports = {};
  new Function("exports", "require", "window", code)(exports, (name) => {
    if (name === "react") return hooks;
    if (name === "react/jsx-runtime") return require(name);
    if (name === "next/navigation") return { usePathname: () => "/" };
    if (name === "@/lib/store") return { useStore: () => state, useScrollLock: (on) => { locked = on; } };
    if (name === "@/lib/catalog-context") return { useCatalog: () => ({ categories: [], products: [] }) };
    return new Proxy({}, { get: () => () => null });
  }, {
    matchMedia: () => ({ matches: animated }),
    setTimeout: (callback, delay) => { timers.set(++id, { callback, due: time + delay }); return id; },
    clearTimeout: (key) => timers.delete(key),
  });
  const render = () => { cursor = 0; exports.Overlays(); };
  const advance = (ms) => {
    time += ms;
    for (const [key, timer] of [...timers]) if (timer.due <= time) { timers.delete(key); timer.callback(); }
    render();
  };
  render(); render();
  return { state, render, advance, locked: () => locked };
}

test("cart retains its scroll lock throughout the mobile exit animation", () => {
  const h = harness();
  assert.equal(h.locked(), true);
  h.state.cartOpen = false; h.render();
  h.advance(449); assert.equal(h.locked(), true);
  h.advance(1); assert.equal(h.locked(), false);
});

test("reopening the cart cancels release; switching to menu keeps the page locked", () => {
  const h = harness();
  h.state.cartOpen = false; h.render(); h.advance(200);
  h.state.cartOpen = true; h.render(); h.advance(300);
  assert.equal(h.locked(), true);
  h.state.cartOpen = false; h.state.menuOpen = true; h.render(); h.advance(500);
  assert.equal(h.locked(), true);
  h.state.menuOpen = false; h.render(); h.advance(450);
  assert.equal(h.locked(), false);
});

test("without mobile motion the drawer releases without an animation delay", () => {
  const h = harness(false);
  h.state.cartOpen = false; h.render(); h.render();
  assert.equal(h.locked(), false);
});

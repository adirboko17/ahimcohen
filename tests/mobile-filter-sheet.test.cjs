const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const ts = require("typescript");
const code = ts.transpileModule(readFileSync(resolve(__dirname, "../components/MobileFilterSheet.tsx"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
function find(node, predicate) {
  if (!node || typeof node !== "object") return undefined;
  if (predicate(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) { const found = find(child, predicate); if (found) return found; }
}
function harness(reduced = false) {
  const values = [], effects = [], timers = new Map(), properties = new Map();
  let cursor = 0, id = 0, time = 0, closed = 0, opened = 0, modalClosed = 0;
  const hooks = {
    useState(initial) { const index = cursor++; if (!(index in values)) values[index] = initial; return [values[index], (value) => { values[index] = typeof value === "function" ? value(values[index]) : value; }]; },
    useRef(initial) { return hooks.useState({ current: initial })[0]; },
    useCallback(fn) { return fn; }, useId: () => "filter-title",
    useEffect(fn) { const index = cursor++; if (!(index in values)) { values[index] = true; effects.push(fn); } },
  };
  const loaded = { exports: {} };
  new Function("require", "module", "exports", "window", "setTimeout", "clearTimeout", code)(
    (name) => name === "react" ? hooks : require(name), loaded, loaded.exports,
    { matchMedia: () => ({ matches: reduced }) },
    (callback, delay) => { timers.set(++id, { callback, due: time + delay }); return id; }, (key) => timers.delete(key),
  );
  const modal = { clientHeight: 600, style: { setProperty: (name, value) => properties.set(name, value) }, showModal: () => opened++, close: () => modalClosed++, getBoundingClientRect: () => ({ top: 100, bottom: 700, left: 0, right: 400 }) };
  const render = () => { cursor = 0; return loaded.exports.MobileFilterSheet({ children: "filters", footer: (close) => require("react").createElement("button", { onClick: close }, "results"), onClose: () => closed++ }); };
  const first = render(); first.props.ref.current = modal;
  const title = find(first, (node) => node.type === "h2");
  const focusCalls = [];
  title.props.ref.current = { focus: (options) => focusCalls.push(options) };
  const cleanups = effects.map((fn) => fn());
  const handle = () => find(render(), (node) => node.props?.className === "filter-sheet-handle");
  const pointer = (y, stamp = 0) => ({ pointerId: 1, isPrimary: true, button: 0, clientY: y, timeStamp: stamp, currentTarget: { setPointerCapture() {}, releasePointerCapture() {} } });
  const advance = (ms) => { time += ms; for (const [key, timer] of [...timers]) if (timer.due <= time) { timers.delete(key); timer.callback(); } };
  return { render, handle, pointer, modal, properties, advance, timers, focusCalls, cleanup: () => cleanups.forEach((fn) => fn?.()), closed: () => closed, opened: () => opened, modalClosed: () => modalClosed };
}
test("filter sheet opens as a native modal with a separate scroll body and fixed footer", () => {
  const h = harness(); const tree = h.render();
  assert.equal(h.opened(), 1);
  assert.equal(tree.type, "dialog");
  assert.equal(tree.props["aria-labelledby"], "filter-title");
  assert.deepEqual(h.focusCalls, [{ preventScroll: true }]);
  assert.equal(find(tree, (node) => node.type === "h2").props.tabIndex, -1);
  assert.ok(find(tree, (node) => node.props?.className === "filter-sheet-content"));
  assert.ok(find(tree, (node) => node.props?.className === "filter-sheet-footer"));
  h.cleanup(); assert.equal(h.modalClosed(), 1);
});
test("long downward drag closes once after the exit animation", () => {
  const h = harness(); h.handle().props.onPointerDown(h.pointer(20));
  h.handle().props.onPointerMove(h.pointer(200, 400));
  assert.equal(h.properties.get("--filter-drag"), "180px");
  h.handle().props.onPointerUp(h.pointer(200, 410));
  h.handle().props.onClick();
  assert.ok(h.render().props.className.includes("is-closing"));
  h.advance(219); assert.equal(h.closed(), 0);
  h.advance(1); assert.equal(h.closed(), 1); h.cleanup();
});
test("short drag settles back without the generated click closing the sheet", () => {
  const h = harness(); h.handle().props.onPointerDown(h.pointer(20));
  h.handle().props.onPointerMove(h.pointer(60, 400));
  h.handle().props.onPointerUp(h.pointer(60, 410)); h.handle().props.onClick();
  assert.equal(h.properties.get("--filter-drag"), "0px");
  h.advance(1000); assert.equal(h.closed(), 0);
  h.handle().props.onClick(); h.advance(220); assert.equal(h.closed(), 1); h.cleanup();
});
test("a quick downward flick closes, but an upward or cancelled gesture does not", () => {
  const h = harness(); h.handle().props.onPointerDown(h.pointer(30));
  h.handle().props.onPointerMove(h.pointer(62, 20)); h.handle().props.onPointerUp(h.pointer(62, 25));
  h.advance(220); assert.equal(h.closed(), 1); h.cleanup();
  const cancelled = harness(); cancelled.handle().props.onPointerDown(cancelled.pointer(50));
  cancelled.handle().props.onPointerMove(cancelled.pointer(20, 20));
  assert.equal(cancelled.properties.get("--filter-drag"), "0px");
  cancelled.handle().props.onPointerCancel(); cancelled.advance(1000);
  assert.equal(cancelled.closed(), 0); cancelled.cleanup();
});
test("Escape, backdrop and results use the same close animation; inside clicks stay open", () => {
  for (const action of ["escape", "backdrop", "results"]) {
    const h = harness(); const tree = h.render();
    tree.props.onClick({ target: h.modal, currentTarget: h.modal, clientX: 200, clientY: 300 });
    h.advance(300); assert.equal(h.closed(), 0);
    if (action === "escape") { let prevented = false; tree.props.onCancel({ preventDefault: () => { prevented = true; } }); assert.equal(prevented, true); }
    if (action === "backdrop") tree.props.onClick({ target: h.modal, currentTarget: h.modal, clientX: 200, clientY: 50 });
    if (action === "results") find(tree, (node) => node.props?.children === "results").props.onClick();
    h.advance(220); assert.equal(h.closed(), 1); h.cleanup();
  }
});
test("reduced motion closes immediately and unmount cancels pending callbacks", () => {
  const reduced = harness(true); reduced.handle().props.onClick(); reduced.advance(0);
  assert.equal(reduced.closed(), 1); reduced.cleanup();
  const h = harness(); h.handle().props.onClick(); h.cleanup(); h.advance(1000);
  assert.equal(h.closed(), 0); assert.equal(h.timers.size, 0);
});

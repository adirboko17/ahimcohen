const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const ts = require("typescript");
const code = ts.transpileModule(readFileSync(resolve(__dirname, "../lib/brand-carousel-autoplay.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function events(extra = {}) {
  const listeners = new Map();
  return { ...extra, listeners,
    addEventListener(event, callback) { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(callback); },
    removeEventListener(event, callback) { listeners.get(event)?.delete(callback); },
    emit(event, payload = {}) { for (const callback of [...(listeners.get(event) ?? [])]) callback(payload); },
  };
}
function harness({ mobile = true, reduced = false, width = 1000, cycle = 350, roundPixels = false } = {}) {
  const viewport = events({ matches: mobile }), motion = events({ matches: reduced });
  const doc = events({ hidden: false });
  const element = events({ scrollWidth: width, clientWidth: 300, scrollLeft: 0, contains: () => false,
    querySelector(selector) { return { offsetLeft: selector === ".brand-card" ? cycle : 0 }; },
    scrollTo({ left }) { this.scrollLeft = roundPixels ? Math.round(left) : left; } });
  const win = events({ matchMedia: (query) => query.includes("max-width") ? viewport : motion });
  const frames = new Map(), timers = new Map(); let id = 0, time = 0, observer;
  class Observer { constructor(callback) { this.callback = callback; observer = this; } observe() {} disconnect() { this.disconnected = true; } }
  const loaded = {};
  new Function("exports", "window", "document", "IntersectionObserver", "requestAnimationFrame", "cancelAnimationFrame", "setTimeout", "clearTimeout", code)(
    loaded, win, doc, Observer,
    (callback) => { frames.set(++id, callback); return id; }, (key) => frames.delete(key),
    (callback, delay) => { timers.set(++id, { callback, due: time + delay }); return id; }, (key) => timers.delete(key),
  );
  const { stop, interact } = loaded.startBrandAutoplay(element);
  const advance = (ms) => { time += ms; for (const [key, timer] of [...timers]) if (timer.due <= time) { timers.delete(key); timer.callback(); } };
  const step = (now) => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach((callback) => callback(now)); };
  const show = (visible = true) => observer.callback([{ isIntersecting: visible, intersectionRatio: visible ? 1 : 0 }]);
  return { element, doc, win, viewport, motion, frames, timers, advance, interact, step, show, stop, observer };
}
test("mobile autoplay moves slowly in RTL only while visible", () => {
  const h = harness();
  assert.equal(h.frames.size, 0);
  h.show();
  for (let now = 100; now <= 1100; now += 20) h.step(now);
  assert.ok(Math.abs(h.element.scrollLeft + 24) < .01);
  h.stop();
});
test("touch pauses immediately, never resumes during a held gesture, and resumes six seconds after release", () => {
  const h = harness(); h.show(); h.step(100); h.step(120);
  const position = h.element.scrollLeft;
  h.element.emit("pointerdown", { pointerId: 1 });
  h.element.emit("touchstart");
  assert.equal(h.frames.size, 0);
  h.advance(12000); assert.equal(h.frames.size, 0);
  h.doc.emit("pointerup", { pointerId: 1 });
  h.advance(6000); assert.equal(h.frames.size, 0); // Still held through the touch API.
  h.doc.emit("touchend", { touches: [] });
  h.advance(5999); assert.equal(h.frames.size, 0);
  h.advance(1); assert.equal(h.frames.size, 1);
  h.step(20000); assert.equal(h.element.scrollLeft, position);
  h.step(20020); assert.ok(h.element.scrollLeft < position);
  h.stop();
});
test("wheel input, momentum scrolling and navigation controls reset the idle countdown", () => {
  const h = harness(); h.show(); h.element.emit("wheel");
  h.advance(5000); h.element.emit("scroll");
  h.advance(5000); assert.equal(h.frames.size, 0);
  h.interact(); // Previous/next button.
  h.advance(5999); assert.equal(h.frames.size, 0);
  h.advance(1); assert.equal(h.frames.size, 1);
  h.stop();
});
test("autoplay's own scroll events do not start the idle timer", () => {
  const h = harness(); h.show(); h.step(100); h.step(120); h.element.emit("scroll");
  assert.equal(h.timers.size, 0); assert.equal(h.frames.size, 1); h.stop();
});
test("keyboard focus stays still until focus leaves, while pointer focus resumes after inactivity", () => {
  const h = harness(); h.show();
  h.element.emit("focusin", { target: { matches: () => true } });
  h.element.emit("keydown"); h.advance(10000); assert.equal(h.frames.size, 0);
  h.element.emit("focusout", { relatedTarget: null });
  h.advance(6000); assert.equal(h.frames.size, 1);
  h.element.emit("focusin", { target: { matches: () => false } });
  h.advance(6000); assert.equal(h.frames.size, 1);
  h.stop();
});
test("manual stop cancels automatic resumption", () => {
  const h = harness(); h.show(); h.element.emit("wheel");
  assert.equal(h.timers.size, 1);
  h.stop(); h.advance(20000);
  assert.equal(h.frames.size, 0); assert.equal(h.timers.size, 0);
});
test("idle expiry respects hidden tabs, offscreen state and reduced motion", () => {
  const h = harness(); h.show(); h.interact(); h.show(false); h.advance(6000);
  assert.equal(h.frames.size, 0);
  h.show(); assert.equal(h.frames.size, 1);
  h.interact(); h.doc.hidden = true; h.doc.emit("visibilitychange"); h.advance(6000);
  assert.equal(h.frames.size, 0);
  h.doc.hidden = false; h.doc.emit("visibilitychange"); assert.equal(h.frames.size, 1);
  h.interact(); h.motion.matches = true; h.motion.emit("change"); h.advance(6000);
  assert.equal(h.frames.size, 0); h.stop();
});
test("desktop and reduced-motion preferences disable autoplay and respond to preference changes", () => {
  const h = harness({ mobile: false }); h.show();
  assert.equal(h.frames.size, 0);
  h.viewport.matches = true; h.viewport.emit("change");
  assert.equal(h.frames.size, 1);
  h.motion.matches = true; h.motion.emit("change");
  assert.equal(h.frames.size, 0);
  h.motion.matches = false; h.motion.emit("change");
  assert.equal(h.frames.size, 1);
  h.stop();
  const reduced = harness({ reduced: true }); reduced.show();
  assert.equal(reduced.frames.size, 0); reduced.stop();
});
test("hidden tabs and offscreen carousels suspend work without jumping when visible again", () => {
  const h = harness(); h.show(); h.step(100); h.step(120);
  const position = h.element.scrollLeft;
  h.doc.hidden = true; h.doc.emit("visibilitychange");
  assert.equal(h.frames.size, 0);
  h.doc.hidden = false; h.doc.emit("visibilitychange"); h.step(50000);
  assert.equal(h.element.scrollLeft, position);
  h.show(false); assert.equal(h.frames.size, 0);
  h.show(); h.step(100000); assert.equal(h.element.scrollLeft, position);
  h.stop();
});
test("the duplicate set wraps forward through repeated cycles without reversing or pausing", () => {
  const h = harness({ cycle: 48 }); h.show();
  for (let now = 100; now <= 10100; now += 20) {
    h.step(now);
    const expected = ((now - 100) / 1000 * 24) % 48;
    const position = Math.abs(h.element.scrollLeft);
    assert.ok(Math.min(Math.abs(position - expected), Math.abs(position - expected - 48)) < .001);
    assert.equal(h.frames.size, 1);
  }
  h.stop();
});
test("fractional motion keeps advancing when browsers round scrollLeft", () => {
  const h = harness({ roundPixels: true }); h.show();
  for (let now = 100; now <= 1100; now += 10) h.step(now);
  assert.equal(h.element.scrollLeft, -24);
  h.stop();
});
test("resuming inside the duplicate set preserves the visible position within the cycle", () => {
  const h = harness({ cycle: 350 }); h.show(); h.interact();
  h.element.scrollLeft = -400;
  h.advance(6000); h.step(10000);
  assert.equal(h.element.scrollLeft, -50);
  h.step(10020);
  assert.ok(h.element.scrollLeft < -50);
  h.stop();
});
test("cleanup cancels scheduled frames and removes observers and listeners", () => {
  const h = harness(); h.show(); h.interact(); h.stop();
  assert.equal(h.frames.size, 0);
  assert.equal(h.timers.size, 0);
  assert.equal(h.observer.disconnected, true);
  for (const target of [h.element, h.doc, h.win, h.viewport, h.motion]) assert.ok([...target.listeners.values()].every((callbacks) => callbacks.size === 0));
});

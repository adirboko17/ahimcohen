const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const ts = require("typescript");
const code = ts.transpileModule(readFileSync(resolve(__dirname, "../lib/offer-completion-price.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const loaded = { exports: {} };
new Function("module", "exports", code)(loaded, loaded.exports);
const { completionCart, completionPrice } = loaded.exports;
const line = (variantId, qty = 1) => ({ pid: "shirt", variantId, color: variantId, size: "L", qty });

test("completing two shirts costs the net 51, including the discount on the existing shirt", () => {
  assert.deepEqual(completionPrice({ total: 89, savings: 0 }, { total: 140, savings: 38 }), {
    addedPayment: 51, cartTotal: 140, additionalSavings: 38, totalSavings: 38,
  });
});
test("preview prices the whole cart and distinguishes new savings from existing discounts", () => {
  assert.deepEqual(completionPrice({ total: 189, savings: 20 }, { total: 240, savings: 58 }), {
    addedPayment: 51, cartTotal: 240, additionalSavings: 38, totalSavings: 58,
  });
});
test("same variants merge without mutating the real cart; different colors/sizes stay separate", () => {
  const original = Object.freeze([Object.freeze(line("blue")), Object.freeze({ ...line("boots"), pid: "boots", qty: 2 })]);
  const result = completionCart(original, [line("blue", 2), line("white")]);
  assert.deepEqual(result.map((item) => [item.variantId, item.qty]), [["blue", 3], ["boots", 2], ["white", 1]]);
  assert.equal(original[0].qty, 1);
  assert.equal(original.length, 2);
});
test("legacy lines without IDs merge only when product, color and size match", () => {
  const first = { ...line(undefined), color: "blue" };
  const result = completionCart([first], [{ ...first }, { ...first, size: "M" }]);
  assert.equal(result.length, 2);
  assert.equal(result[0].qty, 2);
});
test("missing current or future quote cannot produce a confirmable price", () => {
  assert.equal(completionPrice(undefined, { total: 140, savings: 38 }), null);
  assert.equal(completionPrice({ total: 89, savings: 0 }, undefined), null);
});
test("rounding and a lower future cart total are preserved without hiding discount changes", () => {
  assert.equal(completionPrice({ total: 10.1, savings: 0 }, { total: 20.3, savings: 2.3 }).addedPayment, 10.2);
  assert.equal(completionPrice({ total: 100, savings: 0 }, { total: 90, savings: 60 }).addedPayment, -10);
  assert.equal(completionPrice({ total: 100, savings: 20 }, { total: 160, savings: 10 }).additionalSavings, -10);
});

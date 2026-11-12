const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const ts = require("typescript");
function load(name) {
  const source = ts.transpileModule(readFileSync(resolve(__dirname, `../lib/${name}.ts`), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", source)((id) => load(id.replace(/^\.\//, "")), module, module.exports);
  return module.exports;
}
const { updateCartSelection: update } = load("cart-selection");
const { updateCartUnitSelection: updateUnit } = load("cart-selection");
const p = {
  id: "shirt", colors: ["navy", "white"], sizes: ["M", "L", "XXL"], price: 50,
  choices: [
    { id: "navy-m", color: "navy", size: "M", available: true, price: 50 },
    { id: "white-l", color: "white", size: "L", available: true, price: 60 },
    { id: "white-xxl", color: "white", size: "XXL", available: true, price: 70 },
    { id: "navy-l", color: "navy", size: "L", available: false, price: 50 },
  ],
};
const line = { key: "shirt|navy|M", pid: "shirt", color: "navy", size: "M", qty: 3, variantId: "navy-m", unitPrice: 50 };
test("editing resolves aliases to the exact variant, refreshes price, and preserves quantity", () => {
  const cart = Object.freeze([Object.freeze({ ...line })]);
  assert.deepEqual(update(cart, line.key, p, { color: "לבן", size: "2XL" }), [{
    ...line, key: "shirt|white|XXL", color: "white", size: "XXL", variantId: "white-xxl", unitPrice: 70,
  }]);
  assert.equal(cart[0].color, "navy");
});
test("editing into an existing variant merges quantities without duplicates", () => {
  const other = { ...line, key: "shirt|white|L", color: "white", size: "L", qty: 2, variantId: "white-l", unitPrice: 55 };
  const unrelated = { ...line, key: "other", pid: "hat" };
  const result = update([line, other, unrelated], line.key, p, { color: "white", size: "L" });
  assert.deepEqual(result, [{ ...other, qty: 5, unitPrice: 60 }, unrelated]);
});
test("unavailable or nonexistent combinations leave the cart unchanged", () => {
  const cart = [line];
  for (const selection of [{ color: "navy", size: "L" }, { color: "white", size: "M" }, { color: "red", size: "M" }, { color: "white", size: "" }]) {
    assert.equal(update(cart, line.key, p, selection), cart);
  }
  assert.equal(update(cart, "missing", p, { color: "white", size: "L" }), cart);
});
test("unchanged selection does not double quantities, and legacy catalogs remain editable", () => {
  assert.deepEqual(update([line], line.key, p, { color: "navy", size: "M" }), [line]);
  const legacy = update([line], line.key, { ...p, choices: undefined }, { color: "white", size: "2XL" });
  assert.equal(legacy[0].size, "XXL");
  assert.equal(legacy[0].variantId, undefined);
  assert.equal(legacy[0].qty, 3);
});

test("editing a grouped unit splits exactly one item and preserves the other units and checkout identity", () => {
  const source = { ...line, instanceId: "original" };
  const result = updateUnit([source], line.key, p, { color: "white", size: "2XL" }, "new-unit");
  assert.deepEqual(result, [
    { ...source, qty: 2 },
    { ...source, key: "shirt|white|XXL", color: "white", size: "XXL", qty: 1, variantId: "white-xxl", unitPrice: 70, instanceId: "new-unit" },
  ]);
  assert.equal(source.qty, 3);
});

test("editing one grouped unit into another existing variant merges only that unit", () => {
  const target = { ...line, key: "shirt|white|L", color: "white", size: "L", qty: 2, variantId: "white-l", unitPrice: 60, instanceId: "target" };
  const unrelated = { ...line, pid: "hat", key: "hat", qty: 1 };
  const result = updateUnit([line, target, unrelated], line.key, p, { color: "white", size: "L" }, "unused");
  assert.deepEqual(result, [{ ...line, qty: 2 }, { ...target, qty: 3 }, unrelated]);
  const last = updateUnit([{ ...line, qty: 1 }, target], line.key, p, { color: "white", size: "L" }, "unused");
  assert.deepEqual(last, [{ ...target, qty: 3 }]);
});

test("unavailable, unchanged and removed grouped units leave the cart unchanged", () => {
  const cart = [line];
  assert.equal(updateUnit(cart, line.key, p, { color: "navy", size: "L" }, "unused"), cart);
  assert.equal(updateUnit(cart, line.key, p, { color: "navy", size: "M" }, "unused"), cart);
  assert.equal(updateUnit(cart, "gone", p, { color: "white", size: "L" }, "unused"), cart);
});

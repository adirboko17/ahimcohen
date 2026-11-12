const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { transpileModule, ModuleKind, ScriptTarget } = require("typescript");

function load(name) {
  const compiled = transpileModule(readFileSync(resolve(__dirname, `../lib/${name}.ts`), "utf8"), {
    compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  new Function("exports", "module", "require", compiled)(loaded.exports, loaded, (id) => load(id.replace(/^\.\//, "")));
  return loaded.exports;
}
const { prepareReorder, previewReorder, reorderVariantOptions } = load("reorder");
const { pickVariant, ORDERS, PRODUCTS } = load("catalog");
const { cartMath } = load("pricing");

function fixture(sizes = ["S", "2XL"]) {
  return {
    id: "shirt", name: "חולצה", colors: ["blue", "black"], sizes,
    choices: sizes.flatMap((size) => ["blue", "black"].map((color) => ({
      id: `${color}-${size}`, size, color, available: true, price: 100,
    }))),
  };
}
const lookup = (product) => (id) => id === product.id ? product : undefined;

test("reorders resolve size aliases in both directions and preserve color, quantity and history", () => {
  for (const [historical, current] of [["XXL", "2XL"], ["2XL", "XXL"], ["XXXL", "3XL"], ["LXL", "L/XL"], ["OS", "מידה אחת"]]) {
    const product = fixture(["S", current]);
    const lines = Object.freeze([Object.freeze(["shirt", "black", historical, 4])]);
    const before = JSON.stringify({ product, lines });
    const result = prepareReorder(lines, lookup(product));
    assert.deepEqual(result, { items: [["shirt", 1, current, 4]], unavailable: [] });
    const [pid, ci, size] = result.items[0];
    assert.equal(pid, product.id);
    assert.equal(pickVariant(product, product.colors[ci], size).id, `black-${current}`);
    assert.equal(JSON.stringify({ product, lines }), before);
  }
});

test("a missing size never falls back to the first size, including products without variant metadata", () => {
  const product = fixture(["S", "XL"]);
  for (const choices of [product.choices, undefined]) {
    const result = prepareReorder([["shirt", "blue", "XXL", 1]], lookup({ ...product, choices }));
    assert.deepEqual(result.items, []);
    assert.deepEqual(result.unavailable, [{ pid: "shirt", name: "חולצה", size: "2XL", color: "כחול", quantity: 1 }]);
  }
});

test("a size available only in another color does not replace the historical variant", () => {
  const product = fixture();
  product.choices.find((choice) => choice.id === "black-2XL").available = false;
  assert.deepEqual(prepareReorder([["shirt", "black", "XXL", 1]], lookup(product)).items, []);
  product.choices = product.choices.filter((choice) => choice.id !== "black-2XL");
  assert.deepEqual(prepareReorder([["shirt", "black", "XXL", 1]], lookup(product)).items, []);
});

test("an available alias is used if the historical spelling is sold out", () => {
  const product = fixture(["S", "XXL", "2XL"]);
  product.choices.find((choice) => choice.id === "black-XXL").available = false;
  const result = prepareReorder([["shirt", "black", "XXL", 2]], lookup(product));
  assert.deepEqual(result.items, [["shirt", 1, "2XL", 2]]);
  assert.equal(pickVariant(product, "black", result.items[0][2]).id, "black-2XL");
});

test("missing products, missing colors and legacy indices are reported separately from available items", () => {
  const product = fixture();
  for (const invalid of [["removed", "blue", "M", 1], ["shirt", "red", "XXL", 1], ["shirt", "", "XXL", 1], ["shirt", 0, "XXL", 1]]) {
    const result = prepareReorder([["shirt", "blue", "S", 2], invalid], lookup(product));
    assert.deepEqual(result.items, [["shirt", 0, "S", 2]]);
    assert.equal(result.unavailable.length, 1);
  }
});

test("colorless and static products retain the correct raw size without inventing variants", () => {
  const product = { id: "hat", name: "כובע", colors: [], sizes: ["OS"] };
  assert.deepEqual(prepareReorder([["hat", "", "מידה אחת", 2]], lookup(product)), {
    items: [["hat", 0, "OS", 2]], unavailable: [],
  });
});

test("renamed colors and sizes resolve together in either language after the color list changes order", () => {
  for (const [historical, current] of [["blue", "כחול"], ["כחול", "Blue"], ["Navy", "כחול כהה"], ["gray / blue", "כחול / אפור"], [encodeURIComponent("כחול"), "blue"]]) {
    const product = fixture();
    product.colors = ["red", current];
    product.choices = product.colors.map((color) => ({ id: `${color}-2XL`, color, size: "2XL", available: true, price: 100 }));
    const lines = Object.freeze([Object.freeze(["shirt", historical, "XXL", 3])]);
    const before = JSON.stringify({ product, lines });
    const result = prepareReorder(lines, lookup(product));
    assert.deepEqual(result, { items: [["shirt", 1, "2XL", 3]], unavailable: [] });
    const [, ci, rawSize] = result.items[0];
    assert.equal(pickVariant(product, product.colors[ci], rawSize).id, `${current}-2XL`);
    assert.equal(JSON.stringify({ product, lines }), before);
  }
});

test("equivalent color aliases are checked for the requested size and availability", () => {
  const product = fixture();
  product.colors = ["blue", "כחול"];
  product.choices = [
    { id: "english-s", color: "blue", size: "S", available: true },
    { id: "english-2xl", color: "blue", size: "2XL", available: false },
    { id: "hebrew-2xl", color: "כחול", size: "2XL", available: true },
  ];
  const result = prepareReorder([["shirt", "blue", "XXL", 2]], lookup(product));
  assert.deepEqual(result.items, [["shirt", 1, "2XL", 2]]);
  assert.equal(pickVariant(product, product.colors[result.items[0][1]], result.items[0][2]).id, "hebrew-2xl");
  product.choices[1].available = true;
  assert.deepEqual(prepareReorder([["shirt", "blue", "XXL", 2]], lookup(product)).items, [["shirt", 0, "2XL", 2]]);
  assert.deepEqual(prepareReorder([["shirt", "כחול", "XXL", 2]], lookup(product)).items, [["shirt", 1, "2XL", 2]]);
  product.choices[1].available = product.choices[2].available = false;
  assert.deepEqual(prepareReorder([["shirt", "blue", "XXL", 2]], lookup(product)).items, []);
});

test("different shades and unrelated unknown colors never substitute for the original color", () => {
  for (const current of ["Navy", "תכלת", "red", "custom blue finish"]) {
    const product = { ...fixture(), colors: [current], choices: [{ id: "wrong", color: current, size: "2XL", available: true }] };
    assert.deepEqual(prepareReorder([["shirt", "blue", "XXL", 1]], lookup(product)).items, []);
  }
  const colorless = { id: "hat", name: "כובע", colors: [], sizes: ["OS"] };
  assert.deepEqual(prepareReorder([["hat", "blue", "OS", 1]], lookup(colorless)).items, []);
});

test("demo history snapshots preserve the original named colors regardless of future ordering", () => {
  for (const order of ORDERS) {
    const original = prepareReorder(order.lines, (id) => PRODUCTS.find((product) => product.id === id));
    assert.equal(original.items.length, order.lines.length);
    const reordered = PRODUCTS.map((product) => ({ ...product, colors: [...product.colors].reverse() }));
    const result = prepareReorder(order.lines, (id) => reordered.find((product) => product.id === id));
    assert.equal(result.items.length, order.lines.length);
    for (let i = 0; i < result.items.length; i++) {
      const [pid, colorIndex] = result.items[i];
      assert.equal(reordered.find((product) => product.id === pid).colors[colorIndex], order.lines[i][1]);
    }
  }
});

test("partial reorders expose exact missing color, size and quantity while preserving available variant choices", () => {
  const shirt = fixture();
  shirt.choices.find((choice) => choice.id === "black-2XL").available = false;
  const hat = { id: "hat", name: "כובע", colors: [], sizes: ["OS"] };
  const lines = Object.freeze([
    Object.freeze(["shirt", "כחול", "XXL", 3]),
    Object.freeze(["shirt", "Black", "XXL", 4]),
    Object.freeze(["shirt", "blue", "XXXL", 2]),
    Object.freeze(["hat", "", "מידה אחת", 1]),
    Object.freeze(["removed", "red", "M", 2]),
  ]);
  const before = JSON.stringify({ shirt, hat, lines });
  const result = prepareReorder(lines, (id) => [shirt, hat].find((product) => product.id === id));
  assert.deepEqual(result.items, [["shirt", 0, "2XL", 3], ["hat", 0, "OS", 1]]);
  assert.deepEqual(result.unavailable, [
    { pid: "shirt", name: "חולצה", size: "2XL", color: "שחור", quantity: 4 },
    { pid: "shirt", name: "חולצה", size: "3XL", color: "כחול", quantity: 2 },
    { pid: "removed", name: "מוצר שאינו זמין יותר (removed)", size: "M", color: "אדום", quantity: 2 },
  ]);
  assert.equal(pickVariant(shirt, shirt.colors[result.items[0][1]], result.items[0][2]).id, "blue-2XL");
  assert.equal(JSON.stringify({ shirt, hat, lines }), before);
});

test("an entirely unavailable order has a missing list and no items to add", () => {
  const product = fixture();
  product.choices.forEach((choice) => { choice.available = false; });
  const result = prepareReorder([["shirt", "blue", "XXL", 2], ["shirt", "black", "S", 1]], lookup(product));
  assert.deepEqual(result.items, []);
  assert.equal(result.unavailable.length, 2);
  assert.deepEqual(prepareReorder([], lookup(product)), { items: [], unavailable: [] });
});

test("preparing again after stock changes excludes newly unavailable items", () => {
  const product = fixture();
  const lines = [["shirt", "blue", "XXL", 2], ["shirt", "black", "S", 1], ["shirt", "red", "M", 3]];
  const preview = prepareReorder(lines, lookup(product));
  assert.equal(preview.items.length, 2);
  product.choices.find((choice) => choice.id === "blue-2XL").available = false;
  const confirmed = prepareReorder(lines, lookup(product));
  assert.deepEqual(confirmed.items, [["shirt", 1, "S", 1]]);
  assert.equal(confirmed.unavailable.length, 2);
});

test("preview totals use current variant prices and exclude unavailable lines", () => {
  const product = { ...fixture(), price: 50 };
  product.choices.find((choice) => choice.id === "blue-2XL").price = 129.9;
  product.choices.find((choice) => choice.id === "black-S").price = 75;
  product.choices.find((choice) => choice.id === "black-2XL").available = false;
  const lines = [["shirt", "כחול", "XXL", 3], ["shirt", "black", "S", 2], ["shirt", "black", "XXL", 8]];
  const result = previewReorder(lines, lookup(product));
  assert.deepEqual(result.available, [
    { sourceIndex: 0, pid: "shirt", variantId: "blue-2XL", name: "חולצה", color: "כחול", size: "2XL", quantity: 3, unitPrice: 129.9, lineTotal: 129.9 * 3 },
    { sourceIndex: 1, pid: "shirt", variantId: "black-S", name: "חולצה", color: "שחור", size: "S", quantity: 2, unitPrice: 75, lineTotal: 150 },
  ]);
  assert.equal(result.quantity, 5);
  assert.equal(result.unavailable.length, 1);
  assert.equal(result.total, 129.9 * 3 + 150);
  // Reproduce the existing addMany price selection, then use actual cart math.
  const cart = result.items.map(([pid, ci, size, qty]) => {
    const color = product.colors[ci];
    const variant = pickVariant(product, color, size);
    return { key: `${pid}|${color}|${size}`, pid, color, size, qty, variantId: variant.id, unitPrice: variant.price };
  });
  assert.equal(cartMath(cart).total, result.total);
});

test("preview supports products without variant prices and an entirely unavailable order", () => {
  const product = { id: "hat", name: "כובע", colors: [], sizes: ["OS"], price: 19.5 };
  const result = previewReorder([["hat", "", "מידה אחת", 2]], lookup(product));
  assert.equal(result.available[0].unitPrice, 19.5);
  assert.equal(result.total, 39);
  assert.equal(result.quantity, 2);
  const missing = previewReorder([["hat", "blue", "OS", 4]], lookup(product));
  assert.deepEqual(missing.available, []);
  assert.equal(missing.total, 0);
  assert.equal(missing.quantity, 0);
  assert.equal(missing.unavailable.length, 1);
});

test("rechecking a preview detects changed prices even when the same items remain available", () => {
  const product = fixture();
  const lines = [["shirt", "blue", "XXL", 2]];
  const preview = previewReorder(lines, lookup(product));
  product.choices.find((choice) => choice.id === "blue-2XL").price = 120;
  const current = previewReorder(lines, lookup(product));
  assert.deepEqual(current.items, preview.items);
  assert.equal(preview.total, 200);
  assert.equal(current.total, 240);
  assert.notEqual(JSON.stringify(current), JSON.stringify(preview));
});

test("quantity edits and removals update preview totals and the actual cart payload without changing history", () => {
  const product = fixture();
  const lines = Object.freeze([
    Object.freeze(["shirt", "blue", "XXL", 2]),
    Object.freeze(["shirt", "black", "S", 3]),
  ]);
  const before = JSON.stringify(lines);
  const edits = Object.freeze({ 0: 5, 1: 0 });
  const result = previewReorder(lines, lookup(product), edits);
  assert.deepEqual(result.items, [["shirt", 0, "2XL", 5]]);
  assert.equal(result.available.length, 1);
  assert.equal(result.available[0].lineTotal, 500);
  assert.equal(result.total, 500);
  assert.equal(result.quantity, 5);
  assert.equal(JSON.stringify(lines), before);
  assert.deepEqual(edits, { 0: 5, 1: 0 });
  const reset = previewReorder(lines, lookup(product), {});
  assert.deepEqual(reset.items, [["shirt", 0, "2XL", 2], ["shirt", 1, "S", 3]]);
});

test("edits remain tied to original lines when earlier variants are missing or removed", () => {
  const product = fixture();
  const lines = [["shirt", "red", "M", 8], ["shirt", "blue", "XXL", 2], ["shirt", "black", "S", 3]];
  const edits = { 1: 0, 2: 6 };
  const result = previewReorder(lines, lookup(product), edits);
  assert.equal(result.unavailable[0].sourceIndex, 0);
  assert.equal(result.available[0].sourceIndex, 2);
  assert.deepEqual(result.items, [["shirt", 1, "S", 6]]);
  product.choices.find((choice) => choice.id === "black-S").available = false;
  const changed = previewReorder(lines, lookup(product), edits);
  assert.deepEqual(changed.items, []);
  assert.deepEqual(changed.unavailable.map((line) => [line.sourceIndex, line.quantity]), [[0, 8], [2, 6]]);
});

test("removing every line yields an empty zero-total draft and invalid quantities never reach the cart", () => {
  const product = fixture();
  const lines = [["shirt", "blue", "XXL", 2], ["shirt", "red", "S", 1]];
  const result = previewReorder(lines, lookup(product), { 0: 0, 1: 0 });
  assert.deepEqual(result, { items: [], unavailable: [], available: [], total: 0, quantity: 0 });
  for (const quantity of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const invalid = previewReorder(lines, lookup(product), { 0: quantity, 1: 0 });
    assert.deepEqual(invalid.items, []);
    assert.equal(invalid.total, 0);
  }
});

test("variant pickers deduplicate aliases, sort sizes and allow colors with other sizes available", () => {
  const product = {
    ...fixture(["XXL", "S", "2XL", "M"]), colors: ["Blue", "כחול", "black", "red"],
    choices: [
      { id: "blue-s", color: "Blue", size: "S", available: true, price: 80 },
      { id: "blue-xxl", color: "Blue", size: "XXL", available: false, price: 100 },
      { id: "hebrew-2xl", color: "כחול", size: "2XL", available: true, price: 110 },
      { id: "black-m", color: "black", size: "M", available: true, price: 95 },
      { id: "red-s", color: "red", size: "S", available: false, price: 80 },
    ],
  };
  assert.deepEqual(reorderVariantOptions(product, "blue"), {
    colors: [{ label: "כחול", available: true }, { label: "שחור", available: true }, { label: "אדום", available: false }],
    sizes: [{ label: "S", available: true }, { label: "M", available: false }, { label: "2XL", available: true }],
  });
  assert.deepEqual(reorderVariantOptions(product, "שחור").sizes, [
    { label: "S", available: false }, { label: "M", available: true }, { label: "2XL", available: false },
  ]);
  assert.ok(reorderVariantOptions(product, "green").sizes.every((size) => !size.available));
});

test("explicit color and size replacements rescue missing lines with their own prices and edited quantities", () => {
  const product = fixture();
  product.choices.find((choice) => choice.id === "black-S").price = 125;
  const lines = Object.freeze([Object.freeze(["shirt", "red", "XXXL", 2])]);
  const variants = Object.freeze({ 0: Object.freeze({ color: "שחור", size: "S" }) });
  const before = JSON.stringify({ product, lines, variants });
  const original = previewReorder(lines, lookup(product));
  assert.equal(original.unavailable.length, 1);
  const result = previewReorder(lines, lookup(product), { 0: 4 }, variants);
  assert.deepEqual(result.items, [["shirt", 1, "S", 4]]);
  assert.equal(result.unavailable.length, 0);
  assert.equal(result.available[0].variantId, "black-S");
  assert.equal(result.available[0].color, "שחור");
  assert.equal(result.available[0].size, "S");
  assert.equal(result.available[0].unitPrice, 125);
  assert.equal(result.total, 500);
  const [, ci, size] = result.items[0];
  assert.equal(pickVariant(product, product.colors[ci], size).id, result.available[0].variantId);
  assert.equal(JSON.stringify({ product, lines, variants }), before);
  assert.equal(previewReorder(lines, lookup(product), {}, {}).unavailable.length, 1);
});

test("changing color never silently substitutes another size and changing size updates the total", () => {
  const product = fixture();
  product.choices.find((choice) => choice.id === "black-2XL").available = false;
  product.choices.find((choice) => choice.id === "black-S").price = 70;
  const lines = [["shirt", "blue", "XXL", 3]];
  assert.equal(previewReorder(lines, lookup(product)).total, 300);
  const incomplete = previewReorder(lines, lookup(product), {}, { 0: { color: "black" } });
  assert.deepEqual(incomplete.items, []);
  assert.equal(incomplete.total, 0);
  assert.equal(incomplete.unavailable[0].size, "2XL");
  const complete = previewReorder(lines, lookup(product), {}, { 0: { color: "black", size: "S" } });
  assert.equal(complete.total, 210);
  assert.deepEqual(complete.items, [["shirt", 1, "S", 3]]);
  product.choices.find((choice) => choice.id === "black-S").available = false;
  assert.deepEqual(previewReorder(lines, lookup(product), {}, { 0: { color: "black", size: "S" } }).items, []);
});

test("variant edits stay on their original line and do not restore removed items", () => {
  const product = fixture();
  const lines = [["shirt", "blue", "XXL", 2], ["shirt", "red", "M", 3]];
  const edits = { 0: { color: "black", size: "S" }, 1: { color: "blue", size: "S" } };
  const result = previewReorder(lines, lookup(product), { 0: 0, 1: 5 }, edits);
  assert.deepEqual(result.items, [["shirt", 0, "S", 5]]);
  assert.equal(result.available[0].sourceIndex, 1);
  assert.equal(result.total, 500);
});

test("colorless products can be explicitly selected and deleted products have no invented replacements", () => {
  const product = { id: "hat", name: "כובע", colors: [], sizes: ["OS"], price: 20 };
  assert.deepEqual(reorderVariantOptions(product, ""), {
    colors: [{ label: "", available: true }], sizes: [{ label: "מידה אחת", available: true }],
  });
  const lines = [["hat", "red", "L", 2]];
  assert.deepEqual(previewReorder(lines, lookup(product), {}, { 0: { color: "", size: "מידה אחת" } }).items, [["hat", 0, "OS", 2]]);
  assert.deepEqual(previewReorder(lines, () => undefined, {}, { 0: { color: "", size: "מידה אחת" } }).items, []);
});

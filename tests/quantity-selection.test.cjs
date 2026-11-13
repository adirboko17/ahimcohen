const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const { resolve, dirname } = require("node:path");
const ts = require("typescript");
function load(file) {
  const full = resolve(__dirname, "..", file);
  const code = ts.transpileModule(readFileSync(full, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", code)((id) => load(resolve(dirname(full), id + ".ts")), loaded, loaded.exports);
  return loaded.exports;
}
const { quantitySelection, changeQuantityUnitColor } = load("lib/quantity-selection.ts");
const product = {
  id: "shirt", name: "חולצת אוברסייז - 2 חולצות ב-140 ש״ח", price: 89,
  colors: ["blue", "white"], sizes: ["L", "M", "XXL", "2XL"],
  choices: [
    { id: "blue-m", color: "blue", size: "M", available: true, price: 89 },
    { id: "blue-l", color: "blue", size: "L", available: true, price: 89 },
    { id: "blue-xxl", color: "blue", size: "XXL", available: true, price: 89 },
    { id: "white-m", color: "white", size: "M", available: false, price: 89 },
    { id: "white-l", color: "white", size: "L", available: true, price: 89 },
    { id: "white-2xl", color: "white", size: "2XL", available: true, price: 89 },
  ],
};

test("each unit keeps its own available variant in the quote and cart additions", () => {
  const selected = quantitySelection(product, [{ color: 0, size: "M" }, { color: 1, size: "2XL" }]);
  assert.equal(selected.complete, true);
  assert.deepEqual(selected.items, [["shirt", 0, "M", 1], ["shirt", 1, "2XL", 1]]);
  assert.deepEqual(selected.quoteLines.map((line) => [line.variantId, line.qty]), [["blue-m", 1], ["white-2xl", 1]]);
});
test("canonical size labels resolve to the correct raw Shopify size for each color", () => {
  const selected = quantitySelection(product, [{ color: 0, size: "2XL" }, { color: 1, size: "XXL" }]);
  assert.deepEqual(selected.items, [["shirt", 0, "XXL", 1], ["shirt", 1, "2XL", 1]]);
  assert.deepEqual(selected.rows[0].options.map((option) => option.label), ["M", "L", "2XL"]);
});
test("identical units merge, while their total quantity still qualifies for the offer", () => {
  const selected = quantitySelection(product, Array.from({ length: 6 }, () => ({ color: 0, size: "L" })));
  assert.deepEqual(selected.items, [["shirt", 0, "L", 6]]);
  assert.equal(selected.quoteLines.length, 1);
  assert.equal(selected.quoteLines[0].qty, 6);
});
test("incomplete or unavailable units prevent partial addition and cannot quote a different variant", () => {
  for (const invalid of [{ color: 1, size: "M" }, { color: 0, size: null }, { color: 20, size: "L" }]) {
    const selected = quantitySelection(product, [{ color: 0, size: "L" }, invalid]);
    assert.equal(selected.complete, false);
    assert.deepEqual(selected.items, []);
    assert.deepEqual(selected.quoteLines, []);
  }
});
test("changing one unit's color clears an unavailable size, preserves an available alias, and never mutates others", () => {
  const first = Object.freeze({ color: 0, size: "M" });
  assert.deepEqual(changeQuantityUnitColor(product, first, 1), { color: 1, size: null });
  assert.deepEqual(first, { color: 0, size: "M" });
  assert.deepEqual(changeQuantityUnitColor(product, { color: 0, size: "XXL" }, 1), { color: 1, size: "XXL" });
});
test("changing quantity prices and adds exactly the currently visible units", () => {
  const selections = [{ color: 0, size: "M" }, { color: 1, size: "L" }, { color: 0, size: "2XL" }];
  assert.equal(quantitySelection(product, selections.slice(0, 2)).quoteLines.reduce((sum, line) => sum + line.qty, 0), 2);
  assert.equal(quantitySelection(product, selections).quoteLines.reduce((sum, line) => sum + line.qty, 0), 3);
});

// Exercise the product's event handlers without a browser: keep hook state across
// renders, select different units, and inspect the actual addMany/quote inputs.
function productHarness() {
  const states = [];
  let cursor = 0;
  let quoted = [];
  const added = [];
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
      return [states[index], (value) => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
    },
    useRef(initial) { return react.useState({ current: initial })[0]; },
    useMemo(fn) { return fn(); },
  };
  const dependencies = {
    react,
    "next/link": () => null,
    "next/navigation": { useRouter: () => ({}) },
    "./ProductImage": { ProductImage: () => null },
    "./ProductBrand": { ProductBrand: () => null },
    "@/lib/brands": load("lib/brands.ts"),
    "./ProductTile": { ProductTile: () => null },
    "./QuantityUnitPicker": { QuantityUnitPicker: function QuantityUnitPicker() {} },
    "./icons": { IconCheck: () => null, IconPhone: () => null, IconPin: () => null, IconTruck: () => null },
    "@/lib/catalog": { FREE_SHIPPING: 299, phOf: () => "", colorLabel: String, swatchColor: String },
    "@/lib/catalog-context": { useCatalog: () => ({ product: () => product, category: () => ({ name: "ביגוד" }), products: [product] }) },
    "@/lib/colors": { uniqueColors: (colors) => colors },
    "@/lib/product-selection": { productColorIndex: () => 0, productGalleryImages: () => [] },
    "@/lib/product-recommendations": { complementaryAccessories: () => [], similarProducts: () => [] },
    "@/lib/pricing": { fmt: String, priceFor: (p, qty) => p.price * qty, saleBadge: () => "" },
    "@/lib/sizes": load("lib/sizes.ts"),
    "@/lib/quantity-offers": load("lib/quantity-offers.ts"),
    "@/lib/quantity-selection": { quantitySelection },
    "@/lib/store": { useScrollLock() {}, useStore: () => ({ cart: [], flash() {}, addMany: (items) => added.push(items) }) },
    "@/lib/use-cart-quote": { useCartQuote: (lines) => { quoted = lines; return { pending: false }; } },
  };
  const code = ts.transpileModule(readFileSync(resolve(__dirname, "../components/ProductView.tsx"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", code)((id) => dependencies[id] ?? require(id), module, module.exports);
  function render() {
    cursor = 0;
    const element = module.exports.ProductView({ id: product.id, fromQuantityOffer: true });
    return element.type(element.props);
  }
  return { render, added, quote: () => quoted };
}
function findElement(node, predicate) {
  if (!node || typeof node !== "object") return undefined;
  if (predicate(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const found = findElement(child, predicate);
    if (found) return found;
  }
}
const pickerOf = (tree) => findElement(tree, (node) => node.type?.name === "QuantityUnitPicker");
const addButton = (tree) => findElement(tree, (node) => node.type === "button" && node.props.className === "btn product-add-btn");

test("the shared product purchase button keeps unit choices independent and adds the full selection", () => {
  const app = productHarness();
  let tree = app.render();
  addButton(tree).props.onClick();
  assert.equal(app.added.length, 0);
  pickerOf(tree).props.onChange(0, { color: 1, size: "L" });
  tree = app.render();
  // Updating the gallery color must not change the other unit's color.
  assert.deepEqual(pickerOf(tree).props.rows[1].selection, { color: 0, size: null });
  assert.deepEqual(app.quote(), []);
  pickerOf(tree).props.onChange(1, { color: 0, size: "2XL" });
  tree = app.render();
  assert.deepEqual(app.quote().map((line) => [line.variantId, line.qty]), [["white-l", 1], ["blue-xxl", 1]]);
  addButton(tree).props.onClick();
  assert.deepEqual(app.added, [
    [["shirt", 1, "L", 1], ["shirt", 0, "XXL", 1]],
  ]);
  findElement(tree, (node) => node.props?.["aria-label"] === "הוספת יחידה").props.onClick();
  tree = app.render();
  assert.equal(pickerOf(tree).props.rows.length, 3);
  assert.deepEqual(pickerOf(tree).props.rows.slice(0, 2).map((row) => row.selection), [{ color: 1, size: "L" }, { color: 0, size: "2XL" }]);
  assert.deepEqual(app.quote(), []);
  addButton(tree).props.onClick();
  assert.equal(app.added.length, 1);
});

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
function productHarness(item = product, props = {}, packProduct, extras = []) {
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
    "./ProductTile": { ProductTile: () => null },
    "./QuantityUnitPicker": { QuantityUnitPicker: function QuantityUnitPicker() {} },
    "./icons": { IconCheck: () => null, IconPackages: () => null, IconPhone: () => null, IconPin: () => null, IconTruck: () => null },
    "@/lib/catalog": { FREE_SHIPPING: 299, phOf: () => "", colorLabel: String, swatchColor: String },
    "@/lib/catalog-context": { useCatalog: () => ({ product: (id) => [item, ...extras, packProduct].find(p => p?.id === id), category: () => ({ name: "ביגוד" }), products: [item, ...extras], brand: () => undefined }) },
    "@/lib/colors": { uniqueColors: (colors) => colors },
    "@/lib/product-selection": { productColorIndex: () => 0, productGalleryImages: () => [] },
    "@/lib/product-recommendations": { complementaryAccessories: () => [], similarProducts: () => [] },
    "@/lib/product-sets": load("lib/product-sets.ts"),
    "@/lib/pricing": { fmt: String, priceFor: (p, qty) => p.price * qty, saleBadge: () => "" },
    "@/lib/sizes": load("lib/sizes.ts"),
    "@/lib/quantity-offers": load("lib/quantity-offers.ts"),
    "@/lib/quantity-selection": { quantitySelection },
    "@/lib/store": { useScrollLock() {}, useStore: () => ({ cart: [], flash() {}, addMany: (items) => added.push(items) }) },
    "@/lib/use-cart-quote": { useCartQuote: (lines) => { quoted = lines; return { pending: false }; } },
    "./ProductReviews": { ProductReviews: () => null, ProductReviewsLink: () => null, reviewSummary: () => ({}) },
  };
  const code = ts.transpileModule(readFileSync(resolve(__dirname, "../components/ProductView.tsx"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", code)((id) => dependencies[id] ?? require(id), module, module.exports);
  function render() {
    cursor = 0;
    const element = module.exports.ProductView({ id: item.id, fromQuantityOffer: true, ...props });
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

test("a complete set adds its Shopify parent at the saved price, while a partial or hidden set cannot use it", () => {
  const base = { ...product, name: "חולצה" };
  const sock = { ...base, id: "sock", name: "גרביים", price: 20, sizes: ["OS"], colors: ["white"],
    choices: [{ id: "sock-os", size: "OS", color: "white", price: 20, available: true }] };
  const offer = { shopifyId: "gid://shopify/Product/123", price: 95,
    variants: [{ id: "gid://shopify/ProductVariant/100", components: ["blue-l", "sock-os"] }] };
  const setting = { mode: "custom", id: base.id, extras: [sock.id], offer };
  const [parent] = load("lib/product-sets.ts").setCartProducts([base, sock], [setting]);
  const props = { initialColor: "blue", initialSize: "L", fromQuantityOffer: false, setSetting: setting };
  const app = productHarness(base, props, parent, [sock]);
  const section = tree => findElement(tree, n => n.props?.className === "bundle");
  const add = tree => findElement(section(tree), n => n.type === "button" && n.props.className === "btn");
  let tree = app.render();
  assert.ok(findElement(section(tree), n => n.type === "span" && n.props.children === "95"));
  add(tree).props.onClick();
  assert.deepEqual(app.added[0], [[parent.id, 0, parent.choices[0].size, 1]]);
  const rows = section(tree).props.children[1];
  findElement(rows[1], n => n.type === "button").props.onClick();
  tree = app.render();
  add(tree).props.onClick();
  assert.deepEqual(app.added[1], [[base.id, 0, "L", 1]]);
  assert.equal(section(productHarness(base, { ...props, setSetting: { ...setting, mode: "hidden" } }, parent, [sock]).render()), undefined);
});

test("a managed tier selects its own variant and adds one bundle instead of two base units", () => {
  const base = { ...product, deal: undefined };
  const pack = { ...base, id: "bundle-cart-pair", name: "מארז זוגי", bundleSourceId: base.id, price: 70,
    choices: [{ id: "gid://shopify/ProductVariant/90", color: "white", size: "L", available: true, price: 70 }] };
  const app = productHarness(base, { fromQuantityOffer: false, bundles: [{ id: "pair", name: "זוג", quantity: 2, total: 70, cartProductId: pack.id }] }, pack);
  let tree = app.render();
  findElement(tree, (node) => node.type === "input" && node.props.value === "pair").props.onChange();
  tree = app.render();
  assert.equal(pickerOf(tree), undefined);
  assert.equal(findElement(tree, (node) => node.type === "span" && node.props["aria-live"] === "polite").props.children, "70");
  addButton(tree).props.onClick();
  assert.deepEqual(app.added, [[[pack.id, 1, "L", 1]]]);
});

test("a mixed tier selects independently for each unit and uses exact Shopify variant mappings", () => {
  const base = { ...product, deal: undefined, choices: [
    { ...product.choices[0], id: "cotton", optionsLabel: "בד כותנה" },
    { ...product.choices[0], id: "linen", optionsLabel: "בד פשתן" },
    { ...product.choices[4], id: "silk", optionsLabel: "בד משי" },
  ] };
  const pack = { ...base, id: "bundle-cart-pair", bundleSourceId: base.id, price: 70,
    choices: base.choices.slice(0, 2).map((choice, index) => ({ ...choice, id: `pack-${index}`, sourceVariantId: choice.id, price: 70 })).reverse() };
  const app = productHarness(base, { fromQuantityOffer: false, bundles: [{ id: "pair", name: "זוג", quantity: 2, total: 70, cartProductId: pack.id, mixedUnits: true }] }, pack);
  let tree = app.render();
  findElement(tree, (node) => node.type === "input" && node.props.value === "pair").props.onChange();
  tree = app.render();
  assert.equal(pickerOf(tree).props.rows.length, 2);
  assert.equal(pickerOf(tree).props.selectByVariant, true);
  assert.equal(pickerOf(tree).props.product.choices.find(({ id }) => id === "silk").available, false);
  pickerOf(tree).props.onChange(0, { color: 0, size: "M", variantId: "linen" });
  tree = app.render();
  addButton(tree).props.onClick();
  assert.equal(app.added.length, 0);
  pickerOf(tree).props.onChange(1, { color: 0, size: "M", variantId: "cotton" });
  tree = app.render();
  const packUnits = [{ variantId: "cotton", quantity: 1 }, { variantId: "linen", quantity: 1 }];
  assert.deepEqual(app.quote(), [{ pid: pack.id, color: "blue", size: "M", qty: 1, variantId: "pack-0", packUnits }]);
  addButton(tree).props.onClick();
  assert.deepEqual(app.added, [[[pack.id, 0, "M", 1, packUnits]]]);
});

test("admin bundle options set the displayed total and the number of independently selected units", () => {
  const app = productHarness({ ...product, deal: undefined }, { fromQuantityOffer: false, bundles: [
    { id: "two", name: "זוג", quantity: 2, total: 120 },
    { id: "three", name: "שלישייה", quantity: 3, total: 160 },
  ] });
  const pack = (tree, value) => findElement(tree, (node) => node.type === "input" && node.props.type === "radio" && node.props.value === value);
  let tree = app.render();
  assert.equal(pack(tree, 1).props.checked, true);
  pack(tree, 3).props.onChange();
  tree = app.render();
  assert.equal(pack(tree, 3).props.checked, true);
  assert.equal(pickerOf(tree).props.rows.length, 3);
  assert.equal(findElement(tree, (node) => node.type === "span" && node.props["aria-live"] === "polite").props.children, "160");
  pack(tree, 2).props.onChange();
  tree = app.render();
  assert.equal(pickerOf(tree).props.rows.length, 2);
  assert.equal(findElement(tree, (node) => node.type === "span" && node.props["aria-live"] === "polite").props.children, "120");
});

test("complete packs price immediately from the selected variant without a remote quote", () => {
  const app = productHarness({ ...product, name: "מארז שתי חולצות בייסיק", price: 99, was: 119,
    choices: [{ id: "blue-m", color: "blue", size: "M", available: true, price: 105 }] });
  let tree = app.render();
  assert.deepEqual(app.quote(), []);
  assert.equal(findElement(tree, (node) => node.type === "span" && node.props["aria-live"] === "polite").props.children, "105");
  findElement(tree, (node) => node.props?.["aria-label"] === "הוספת יחידה").props.onClick();
  tree = app.render();
  assert.deepEqual(app.quote(), []);
  assert.equal(findElement(tree, (node) => node.type === "span" && node.props["aria-live"] === "polite").props.children, "210");
});

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

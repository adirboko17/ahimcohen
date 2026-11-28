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
const { cartGroups, cartGroupPrice, offerMissingQuantity } = load("lib/cart-groups.ts");
const products = {
  shirt: { id: "shirt", name: "חולצת אוברסייז - 2 חולצות ב-140 ש״ח", price: 89 },
  pants: { id: "pants", name: "מכנסיים", price: 179, deal: [2, 298] },
  pack: { id: "pack", name: "מארז שתי חולצות בייסיק", price: 99, was: 119 },
  hat: { id: "hat", name: "כובע", price: 30 },
};
const line = (pid, variantId, qty = 1) => ({ key: `${pid}|${variantId}`, pid, variantId, qty, color: variantId, size: "L" });
test("mixed units of one offer appear together in first-occurrence order; packs and unrelated products stay independent", () => {
  const cart = [line("shirt", "blue"), line("hat", "black"), line("pants", "olive", 2), line("shirt", "white"), line("pack", "black")];
  const groups = cartGroups(cart, (id) => products[id]);
  assert.deepEqual(groups.map((group) => group.product.id), ["shirt", "hat", "pants", "pack"]);
  assert.deepEqual(groups[0].lines.map((line) => line.variantId), ["blue", "white"]);
  assert.equal(groups[0].offer.quantity, 2);
  assert.equal(groups[3].offer, null);
  assert.equal(cart.length, 5);
});
test("the group total uses actual discounts, including an offer that applies only once", () => {
  const rows = [line("shirt", "blue", 2), line("shirt", "white", 2)];
  const quote = { lines: { blue: { quantity: 2, regular: 178, total: 140 }, white: { quantity: 2, regular: 178, total: 178 } } };
  assert.deepEqual(cartGroupPrice(rows, quote), { regular: 356, total: 318, savings: 38 });
});
test("duplicate local aliases do not count the variant's discount twice", () => {
  const rows = [line("shirt", "blue"), { ...line("shirt", "blue"), key: "legacy-blue" }];
  assert.deepEqual(cartGroupPrice(rows, { lines: { blue: { quantity: 2, regular: 178, total: 140 } } }), { regular: 178, total: 140, savings: 38 });
});
test("one remaining unit stays editable in its group without a stale discount", () => {
  const rows = [line("shirt", "blue")];
  assert.equal(cartGroups(rows, (id) => products[id]).length, 1);
  assert.deepEqual(cartGroupPrice(rows, { lines: { blue: { quantity: 1, regular: 89, total: 89 } } }), { regular: 89, total: 89, savings: 0 });
  assert.equal(cartGroupPrice(rows), null);
  assert.equal(cartGroupPrice(rows, { lines: {} }), null);
  assert.equal(cartGroupPrice(rows, { lines: { blue: { quantity: 2, regular: 178, total: 140 } } }), null);
});

function component(file, dependencies) {
  const source = ts.transpileModule(readFileSync(resolve(__dirname, "../components", file + ".tsx"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", source)((id) => dependencies[id] ?? (["./CartItem", "./CartOfferCompletion", "./QuantityUnitPicker"].includes(id) ? component(id.slice(2), dependencies) : require(id)), loaded, loaded.exports);
  return loaded.exports;
}
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const sizes = load("lib/sizes.ts");
const colors = load("lib/colors.ts");
const product = { ...products.shirt, colors: ["blue", "white"], sizes: ["M", "XXL"] };
function dependencies(store) {
  return {
    "@/lib/store": { useStore: () => ({ cart: [], cartQuote: {}, ...store }) },
    "@/lib/offer-completion-price": load("lib/offer-completion-price.ts"),
    "@/lib/cart-unit-presets": load("lib/cart-unit-presets.ts"),
    "@/lib/use-cart-quote": { useCartQuote: () => ({ pending: false }) },
    "@/lib/catalog-context": { useCatalog: () => ({ product: () => product }) },
    "@/lib/cart-groups": { cartGroups, cartGroupPrice, offerMissingQuantity },
    "@/lib/quantity-selection": load("lib/quantity-selection.ts"),
    "@/lib/pricing": { fmt: (n) => `${n} ₪` },
    "@/lib/catalog": { colorLabel: colors.colorLabel, swatchColor: colors.swatchColor, phOf: () => "" },
    "@/lib/product-selection": { cartProductImage: () => undefined },
    "@/lib/sizes": sizes,
    "./ProductImage": { ProductImage: () => null },
    "./UnitSwatchSelect": component("UnitSwatchSelect", {}),
  };
}
test("cart renders a single offer total and every unit's Hebrew color and normalized size", () => {
  const cart = [{ ...line("shirt", "blue", 2), size: "M" }, { ...line("shirt", "white"), size: "XXL" }];
  const quote = { lines: { blue: { quantity: 2, regular: 178, total: 140 }, white: { quantity: 1, regular: 89, total: 89 } } };
  const { CartContents } = component("CartContents", dependencies({ cart, cartQuote: { quote, pending: false } }));
  const html = renderToStaticMarkup(React.createElement(CartContents));
  assert.equal((html.match(/class="cart-quantity-group"/g) || []).length, 1);
  assert.match(html, /<b>229 ₪<\/b>/);
  for (const text of ["יחידה 1", "יחידה 2", "יחידה 3", "כחול · M", "לבן · 2XL", "חסכתם 38 ₪"]) assert.ok(html.includes(text), text);
  assert.equal((html.match(/שינוי צבע ומידה/g) || []).length, 3);
  assert.equal((html.match(/229 ₪/g) || []).length, 1);
});

function find(node, predicate) {
  if (!node || typeof node !== "object") return undefined;
  if (predicate(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) { const found = find(child, predicate); if (found) return found; }
}
test("the unit editor saves only one unit and its remove action removes just one", () => {
  const values = []; let cursor = 0;
  const edits = [], quantities = [];
  const deps = dependencies({ cartQuote: {}, setUnitSelection: (...args) => edits.push(args), setQtyLine: (...args) => quantities.push(args), setLineSelection: () => { throw new Error("Whole line must not change"); } });
  deps.react = { useState(initial) { const index = cursor++; if (!(index in values)) values[index] = initial; return [values[index], (value) => { values[index] = value; }]; } };
  const { CartItem } = component("CartItem", deps);
  const selectedLine = { ...line("shirt", "blue"), size: "M" };
  const render = () => { cursor = 0; return CartItem({ line: selectedLine, product, unitNumber: 2 }); };
  const button = (tree, text) => find(tree, (node) => node.type === "button" && node.props.children === text);
  button(render(), "שינוי צבע ומידה").props.onClick();
  find(render(), (node) => node.props?.["aria-label"] === "צבע ליחידה 2").props.onChange({ target: { value: "white" } });
  find(render(), (node) => node.props?.["aria-label"] === "מידה ליחידה 2").props.onChange({ target: { value: "2XL" } });
  button(render(), "שמירה").props.onClick();
  assert.deepEqual(edits, [[selectedLine.key, { color: "white", size: "2XL" }]]);
  button(render(), "הסרת יחידה").props.onClick();
  assert.deepEqual(quantities, [[selectedLine.key, -1]]);
});

test("missing units are based on the offer threshold, never the next multiple", () => {
  const offer = { kind: "quantity", quantity: 2 };
  assert.equal(offerMissingQuantity(offer, 1), 1);
  assert.equal(offerMissingQuantity(offer, 2), 0);
  assert.equal(offerMissingQuantity(offer, 3), 0);
  assert.equal(offerMissingQuantity({ ...offer, quantity: 6 }, 2), 4);
  assert.equal(offerMissingQuantity({ ...offer, kind: "pack" }, 1), 0);
});

test("below-threshold cart shows exact missing count and completion button, and hides it when restored", () => {
  const cart = [{ ...line("shirt", "blue"), size: "M" }];
  const store = { cart, cartQuote: { pending: true } };
  const { CartContents } = component("CartContents", dependencies(store));
  const html = renderToStaticMarkup(React.createElement(CartContents));
  assert.ok(html.includes("חסרה יחידה אחת"));
  assert.ok(html.includes("2 יחידות ב־140 ₪"));
  assert.ok(html.includes("השלמת יחידה למבצע"));
  assert.ok(html.includes('role="status"'));
  store.cart = [{ ...cart[0], qty: 2 }];
  const restored = renderToStaticMarkup(React.createElement(CartContents));
  assert.ok(!restored.includes("השלמת יחידה למבצע"));
});

test("completion validates selections, adds only missing units once, and keeps the drawer open", () => {
  const values = []; let cursor = 0;
  const added = [];
  const deps = dependencies({ cartOpen: true, cart: [{ ...line("shirt", "blue"), size: "M" }], cartQuote: { quote: { total: 89, savings: 0 } }, addMany: (...args) => added.push(args) });
  let previewPending = false;
  let quotedLines = [];
  deps["@/lib/use-cart-quote"] = { useCartQuote: (lines) => {
    quotedLines = lines;
    return previewPending ? { pending: true } : { pending: false, quote: lines.length ? { total: 140, savings: 38 } : undefined };
  } };
  const hooks = {
    useState(initial) { const index = cursor++; if (!(index in values)) values[index] = initial; return [values[index], (value) => { values[index] = typeof value === "function" ? value(values[index]) : value; }]; },
    useRef(initial) { return hooks.useState({ current: initial })[0]; },
    useId: () => "completion-test",
  };
  deps.react = hooks;
  const { CartOfferCompletion } = component("CartOfferCompletion", deps);
  const group = cartGroups([{ ...line("shirt", "blue"), size: "M" }], () => product)[0];
  const render = (disabled = false) => { cursor = 0; return CartOfferCompletion({ group, disabled }); };
  const button = (tree, text) => find(tree, (node) => node.type === "button" && node.props.children === text);
  button(render(), "השלמת יחידה למבצע").props.onClick();
  button(render(), "הוספת היחידה והשלמת המבצע").props.onClick();
  assert.equal(added.length, 0);
  const picker = find(render(), (node) => node.type?.name === "QuantityUnitPicker");
  assert.equal(picker.props.showErrors, true);
  assert.equal(picker.props.rows.length, 1);
  button(render(), "כחול · M").props.onClick();
  const copied = find(render(), (node) => node.type?.name === "QuantityUnitPicker");
  assert.deepEqual(copied.props.rows[0].selection, { color: 0, size: "M" });
  assert.equal(copied.props.showErrors, false);
  assert.equal(quotedLines.reduce((sum, line) => sum + line.qty, 0), 2);
  assert.ok(quotedLines.every((line) => line.color === "blue" && line.size === "M"));
  assert.equal(added.length, 0);
  picker.props.onChange(0, { color: 1, size: "2XL" });
  previewPending = true;
  const loading = button(render(), "הוספת היחידה והשלמת המבצע");
  assert.equal(loading.props.disabled, true);
  assert.ok(renderToStaticMarkup(render()).includes("מחשבים את המחיר והחיסכון"));
  loading.props.onClick();
  assert.equal(added.length, 0);
  previewPending = false;
  button(render(true), "הוספת היחידה והשלמת המבצע").props.onClick();
  assert.equal(added.length, 0);
  const submit = button(render(), "הוספת היחידה והשלמת המבצע");
  const summary = renderToStaticMarkup(render());
  for (const text of ["תוספת לתשלום אחרי ההנחה", "51 ₪", "סה״כ מוצרים בסל לאחר ההשלמה", "140 ₪", "חיסכון נוסף בזכות ההשלמה", "38 ₪"]) assert.ok(summary.includes(text), text);
  assert.equal(quotedLines.reduce((sum, line) => sum + line.qty, 0), 2);
  submit.props.onClick();
  submit.props.onClick();
  assert.deepEqual(added, [[[ ["shirt", 1, "XXL", 1] ], true]]);
});

test("quick choices fill all missing units, then a single unit can be changed independently", () => {
  const values = []; let cursor = 0;
  const deps = dependencies({});
  const hooks = {
    useState(initial) { const index = cursor++; if (!(index in values)) values[index] = initial; return [values[index], (value) => { values[index] = typeof value === "function" ? value(values[index]) : value; }]; },
    useRef(initial) { return hooks.useState({ current: initial })[0]; },
    useId: () => "multiple-units",
  };
  deps.react = hooks;
  const { CartOfferCompletion } = component("CartOfferCompletion", deps);
  const p = { ...product, deal: [6, 300] };
  const group = cartGroups([{ ...line("shirt", "blue"), size: "M" }, { ...line("shirt", "white"), size: "XXL" }], () => p)[0];
  const render = () => { cursor = 0; return CartOfferCompletion({ group }); };
  const button = (tree, text) => find(tree, (node) => node.type === "button" && node.props.children === text);
  button(render(), "השלמת 4 יחידות למבצע").props.onClick();
  button(render(), "לבן · 2XL").props.onClick();
  let picker = find(render(), (node) => node.type?.name === "QuantityUnitPicker");
  assert.equal(picker.props.rows.length, 4);
  assert.ok(picker.props.rows.every((row) => row.selection.color === 1 && row.selection.size === "2XL"));
  picker.props.onChange(1, { color: 0, size: "M" });
  picker = find(render(), (node) => node.type?.name === "QuantityUnitPicker");
  assert.deepEqual(picker.props.rows.map((row) => row.selection), [
    { color: 1, size: "2XL" }, { color: 0, size: "M" }, { color: 1, size: "2XL" }, { color: 1, size: "2XL" },
  ]);
});

test("presets normalize aliases, deduplicate sizes, and keep unavailable or unknown selections disabled", () => {
  const { cartUnitPresets } = load("lib/cart-unit-presets.ts");
  const p = { ...product, choices: [
    { id: "b", color: "blue", size: "XXL", available: true },
    { id: "w", color: "white", size: "M", available: false },
  ] };
  const rows = [
    { ...line("shirt", "b"), color: "כחול", size: "2XL" },
    { ...line("shirt", undefined), color: "blue", size: "XXL" },
    { ...line("shirt", "w"), color: "white", size: "M" },
    { ...line("shirt", undefined), color: "removed-color", size: "M" },
  ];
  const presets = cartUnitPresets(p, rows);
  assert.equal(presets.length, 3);
  assert.deepEqual(presets[0].selection, { color: 0, size: "2XL" });
  assert.equal(presets[0].label, "כחול · 2XL");
  assert.deepEqual(presets.map((preset) => preset.available), [true, false, false]);
});

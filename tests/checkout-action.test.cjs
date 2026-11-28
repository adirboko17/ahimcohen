const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const ts = require("typescript");
const compiled = ts.transpileModule(readFileSync(resolve(__dirname, "../app/actions/shopify-checkout.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function harness(fail = false, returnedCart, discountCodes = [], resolveOffer) {
  const calls = [];
  class ShopifyError extends Error {}
  const dependencies = {
    "@/lib/cart-quote": (() => {
      const code = ts.transpileModule(readFileSync(resolve(__dirname, "../lib/cart-quote.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
      const loaded = { exports: {} };
      new Function("module", "exports", code)(loaded, loaded.exports);
      return loaded.exports;
    })(),
    "next/headers": { headers: async () => new Map([["x-forwarded-for", "203.0.113.1, 10.0.0.1"]]) },
    "@/lib/catalog": { PM: {} },
    "@/lib/shopify/config": { ShopifyError },
    "@/lib/shopify/checkout-status": { checkoutReceipt: () => "test-checkout-receipt" },
    "@/lib/admin/commerce": { managedDiscountCodes: async () => discountCodes },
    "@/lib/admin/quantity-offer-cart": { quantityOfferCartResolver: async () => resolveOffer },
    "@/lib/shopify/products": { findVariantForSelection: () => { throw new Error("Unexpected SKU lookup"); } },
    "@/lib/shopify/cart": { createCart: async (lines, buyerIp, codes) => {
      calls.push({ lines, buyerIp, ...(codes ? { codes } : {}) });
      if (fail) throw new ShopifyError("Shopify unavailable");
      return { checkoutUrl: "https://store.myshopify.com/cart/c/test", ...returnedCart };
    } },
  };
  const module = { exports: {} };
  new Function("require", "module", "exports", compiled)((name) => dependencies[name], module, module.exports);
  return { checkout: module.exports.beginShopifyCheckout, quote: module.exports.quoteShopifyCart, calls };
}
test("checkout sends the current edited variant and quantity and uses Shopify's URL", async () => {
  const { checkout, calls } = harness();
  const line = { pid: "shirt", color: "white", size: "XXL", qty: 3, variantId: "gid://shopify/ProductVariant/123" };
  const result = await checkout([line]);
  assert.deepEqual(result, { ok: true, checkoutUrl: "https://store.myshopify.com/cart/c/test", receipt: "test-checkout-receipt" });
  assert.deepEqual(calls, [{ buyerIp: "203.0.113.1", lines: [{ merchandiseId: line.variantId, quantity: 3, attributes: [{ key: "צבע", value: "white" }, { key: "מידה", value: "XXL" }] }] }]);
});
test("checkout rejects empty carts and invalid quantities before creating a Shopify cart", async () => {
  const { checkout, calls } = harness();
  for (const lines of [[], [{ pid: "shirt", qty: 0, variantId: "gid://shopify/ProductVariant/123" }]]) {
    assert.equal((await checkout(lines)).ok, false);
  }
  assert.equal(calls.length, 0);
});
test("Shopify failure is returned as a recoverable error", async () => {
  const { checkout } = harness(true);
  const result = await checkout([{ pid: "shirt", color: "white", size: "L", qty: 1, variantId: "gid://shopify/ProductVariant/123" }]);
  assert.equal(result.ok, false);
  assert.ok(result.error);
});

test("quote and checkout use the same live discounted amount; price changes require another confirmation", async () => {
  const variantId = "gid://shopify/ProductVariant/123";
  const money = (amount) => ({ amount: String(amount), currencyCode: "ILS" });
  const { checkout, quote } = harness(false, { lines: [{ merchandiseId: variantId, quantity: 2, subtotal: money(178), total: money(140) }] });
  const lines = [{ pid: "shirt", color: "blue", size: "L", qty: 2, variantId }];
  const result = await quote(lines);
  assert.equal(result.ok, true);
  assert.equal(result.quote.total, 140);
  assert.equal(result.quote.savings, 38);
  assert.equal((await checkout(lines, 140)).ok, true);
  const changed = await checkout(lines, 120);
  assert.equal(changed.ok, false);
  assert.equal(changed.checkoutUrl, undefined);
  assert.equal((await checkout([{ ...lines[0], qty: 3 }], 140)).ok, false);
});

test("multiple local lines for one variant are merged before Shopify applies the discount", async () => {
  const variantId = "gid://shopify/ProductVariant/123";
  const { checkout, calls } = harness();
  await checkout([{ pid: "shirt", color: "blue", size: "XXL", qty: 1, variantId }, { pid: "shirt", color: "כחול", size: "2XL", qty: 1, variantId }]);
  assert.equal(calls[0].lines.length, 1);
  assert.equal(calls[0].lines[0].quantity, 2);
});

test("mixed pack compositions are separate Shopify lines even when they share a pack variant", async () => {
  const variantId = "gid://shopify/ProductVariant/123";
  const money = { amount: "120", currencyCode: "ILS" };
  const shopifyLine = { merchandiseId: variantId, quantity: 1, subtotal: money, total: money };
  const { checkout, quote, calls } = harness(false, { lines: [shopifyLine, shopifyLine] }, [], (_, id, qty, units) => ({
    merchandiseId: id, quantity: qty, configurationKey: JSON.stringify(units),
    attributes: [{ key: "הרכב מארז 1", value: units.map(({ variantId }) => variantId).join(", ") }],
  }));
  const line = { pid: "bundle-cart-offer", color: "", size: "", qty: 1, variantId };
  const lines = [
    { ...line, packUnits: [{ variantId: "blue-m", quantity: 1 }, { variantId: "white-l", quantity: 2 }] },
    { ...line, packUnits: [{ variantId: "blue-m", quantity: 2 }, { variantId: "black-xl", quantity: 1 }] },
  ];
  assert.equal((await quote(lines)).quote.total, 240);
  assert.equal((await checkout(lines, 240)).ok, true);
  assert.deepEqual(calls[1].lines.map(({ attributes }) => attributes[0].value), ["blue-m, white-l", "blue-m, black-xl"]);
});

test("a mixed bundle keeps its fixed price and sends the validated unit choices to Shopify", async () => {
  const load = (file, imports = {}) => {
    const code = ts.transpileModule(readFileSync(resolve(__dirname, "../lib", file + ".ts"), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const loaded = { exports: {} };
    new Function("require", "module", "exports", code)((name) => imports[name] ?? require(name), loaded, loaded.exports);
    return loaded.exports;
  };
  const choices = [
    { id: "gray-s", color: "אפור", size: "S", available: true },
    { id: "black-l", color: "שחור", size: "L", available: true, optionsLabel: "צבע שחור · מידה L · בד כותנה" },
  ];
  const bundle = { id: "pair", name: "Pair", items: [["shirt", 2]], active: true, total: 70, mixedUnits: true, sourceVariantIds: choices.map(({ id }) => id) };
  const store = { bundles: [bundle, { ...bundle, id: "triple", items: [["shirt", 3]], mixedUnits: false }], hiddenQuantityOffers: [], offers: [] };
  const { bundleRevision } = load("admin/bundle-mapping", { "server-only": {}, "@/lib/shopify/config": {} });
  const variantId = "gid://shopify/ProductVariant/123";
  const mapping = { source_product_id: "shirt", revision: bundleRevision(store.bundles), variants: [
    { tierId: "pair", sourceVariantId: "gray-s", variantId: "gid://shopify/ProductVariant/124", price: 70 },
    { tierId: "pair", sourceVariantId: "black-l", variantId, price: 70 },
  ] };
  const { quantityOfferCartResolver } = load("admin/quantity-offer-cart", {
    "server-only": {}, "@/lib/catalog": { colorLabel: String }, "@/lib/sizes": load("sizes"),
    "@/lib/quantity-offers": load("quantity-offers"), "./models": load("admin/models"),
    "./bundle-mapping": { bundleRevision, readBundleMappings: async () => [mapping] },
    "./storage": { readAdminStore: async () => store },
    "@/lib/shopify/load-catalog": { loadShopCatalog: async () => ({ products: [{ id: "shirt", choices }] }) },
  });
  const money = { amount: "70", currencyCode: "ILS" };
  const { checkout, quote, calls } = harness(false, { lines: [{ merchandiseId: variantId, quantity: 1, subtotal: money, total: money }] }, [], await quantityOfferCartResolver());
  const line = { pid: "bundle-cart-pair", qty: 1, variantId, packUnits: choices.map(({ id }) => ({ variantId: id, quantity: 1 })) };
  assert.equal((await quote([line])).quote.total, 70);
  assert.equal((await checkout([line], 70)).ok, true);
  assert.equal(calls[1].lines[0].quantity, 1);
  assert.deepEqual(calls[1].lines[0].attributes.map(({ value }) => value), ["1 × צבע שחור · מידה L · בד כותנה", "1 × אפור · S"]);
  assert.equal((await quote([{ ...line, pid: "bundle-cart-triple" }])).ok, false);
  assert.equal((await quote([{ ...line, packUnits: line.packUnits.slice(0, 1) }])).ok, false);
  choices[0].available = false;
  assert.equal((await quote([line])).ok, false);
  assert.equal(calls.length, 2);
});

test("managed quantity discount codes are sent to both the quote and checkout", async () => {
  const variantId = "gid://shopify/ProductVariant/123";
  const money = (amount) => ({ amount: String(amount), currencyCode: "ILS" });
  const cart = { lines: [{ merchandiseId: variantId, quantity: 2, subtotal: money(178), total: money(140) }] };
  const { checkout, quote, calls } = harness(false, cart, ["BULK-CODE"]);
  const lines = [{ pid: "shirt", qty: 2, variantId }];
  assert.equal((await quote(lines)).quote.total, 140);
  assert.equal((await checkout(lines, 140)).ok, true);
  assert.deepEqual(calls.map((call) => call.codes), [["BULK-CODE"], ["BULK-CODE"]]);
});

test("managed bundle tiers use the highest qualifying package for each product", async () => {
  const compiled = ts.transpileModule(readFileSync(resolve(__dirname, "../lib/admin/commerce.ts"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const models = { exports: {} };
  new Function("module", "exports", ts.transpileModule(readFileSync(resolve(__dirname, "../lib/admin/models.ts"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText)(models, models.exports);
  const products = [
    { id: "shirt", choices: [{ id: "shirt-m" }, { id: "shirt-l" }] },
    { id: "pants", choices: [{ id: "pants-s" }] },
  ];
  const bundles = [
    { items: [["shirt", 2]], total: 119, code: "IGNORE", active: true, bundleProductId: "shirt-pack" },
    { items: [["shirt", 2]], total: 120, code: "SHIRT2", active: true },
    { items: [["shirt", 3]], total: 160, code: "SHIRT3", active: true },
    { items: [["shirt", 4]], total: 180, code: "DRAFT", active: false },
    { items: [["shirt", 5]], total: 220, code: "", active: true },
  ];
  const offers = [{ productId: "pants", quantity: 2, code: "PANTS2", active: true }];
  let hiddenQuantityOffers = [];
  const deps = {
    "./models": models.exports,
    "./storage": { readAdminStore: async () => ({ offers, bundles, hiddenQuantityOffers }) },
    "@/lib/shopify/load-catalog": { loadShopCatalog: async () => ({ products }) },
  };
  const module = { exports: {} };
  new Function("require", "module", "exports", compiled)((name) => deps[name] ?? {}, module, module.exports);
  const codes = (shirtLarge) => module.exports.managedDiscountCodes([
    { merchandiseId: "shirt-m", quantity: 1 },
    { merchandiseId: "shirt-l", quantity: shirtLarge },
    { merchandiseId: "pants-s", quantity: 2 },
  ]);
  assert.deepEqual(await codes(1), ["SHIRT2", "PANTS2"]);
  assert.deepEqual(await codes(2), ["SHIRT3", "PANTS2"]);
  assert.deepEqual(await codes(3), ["SHIRT3", "PANTS2"]);
  assert.deepEqual(await codes(4), ["PANTS2"]);
  hiddenQuantityOffers = ["pants"];
  assert.deepEqual(await codes(1), ["SHIRT2"]);
});

test("same product in different colors and sizes keeps separate quantities and variant IDs", async () => {
  const { checkout, calls } = harness();
  const lines = [
    { pid: "shirt", color: "white", size: "M", qty: 2, variantId: "gid://shopify/ProductVariant/101" },
    { pid: "shirt", color: "white", size: "L", qty: 1, variantId: "gid://shopify/ProductVariant/102" },
    { pid: "shirt", color: "navy", size: "M", qty: 3, variantId: "gid://shopify/ProductVariant/103" },
  ];
  assert.equal((await checkout(lines)).ok, true);
  assert.deepEqual(calls[0].lines.map((line) => [line.merchandiseId, line.quantity]), lines.map((line) => [line.variantId, line.qty]));
  for (let i = 0; i < lines.length; i++) {
    assert.deepEqual(calls[0].lines[i].attributes, [{ key: "צבע", value: lines[i].color }, { key: "מידה", value: lines[i].size }]);
  }
});

test("only repeated entries of the exact same variant are combined", async () => {
  const { checkout, calls } = harness();
  const one = { pid: "shirt", color: "white", size: "M", qty: 2, variantId: "gid://shopify/ProductVariant/101" };
  const two = { ...one, size: "L", qty: 1, variantId: "gid://shopify/ProductVariant/102" };
  assert.equal((await checkout([one, two, { ...one, qty: 3 }])).ok, true);
  assert.deepEqual(calls[0].lines.map((line) => [line.merchandiseId, line.quantity]), [[one.variantId, 5], [two.variantId, 1]]);
});

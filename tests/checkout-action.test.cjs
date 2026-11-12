const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const ts = require("typescript");
const compiled = ts.transpileModule(readFileSync(resolve(__dirname, "../app/actions/shopify-checkout.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function harness(fail = false, returnedCart) {
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
    "@/lib/shopify/products": { findVariantForSelection: () => { throw new Error("Unexpected SKU lookup"); } },
    "@/lib/shopify/cart": { createCart: async (lines, buyerIp) => {
      calls.push({ lines, buyerIp });
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

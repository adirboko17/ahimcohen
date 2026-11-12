const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const ts = require("typescript");
const code = ts.transpileModule(readFileSync(resolve(__dirname, "../lib/cart-quote.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const loaded = { exports: {} };
new Function("module", "exports", code)(loaded, loaded.exports);
const { cartQuote } = loaded.exports;
const money = (amount) => ({ amount: String(amount), currencyCode: "ILS" });
const row = (id, quantity, regular, total) => ({ merchandiseId: id, quantity, subtotal: money(regular), total: money(total) });
const quote = (lines, requested) => cartQuote({ lines }, requested ?? lines.map((line) => ({ merchandiseId: line.merchandiseId, quantity: line.quantity })));

test("actual Shopify discounts win over multiplying the advertised bundle price", () => {
  assert.equal(quote([row("shirt", 2, 178, 140)]).total, 140);
  assert.equal(quote([row("shirt", 4, 356, 318)]).total, 318);
  assert.equal(quote([row("pants", 3, 537, 447)]).total, 447);
  const reduced = quote([row("shirt", 1, 89, 89)]);
  assert.equal(reduced.total, 89);
  assert.equal(reduced.savings, 0);
});
test("different sizes/colors and unrelated products keep their actual line discounts", () => {
  const result = quote([row("shirt-blue-L", 1, 89, 70), row("shirt-white-XL", 1, 89, 70), row("boots", 1, 300, 300)]);
  assert.equal(result.regular, 478);
  assert.equal(result.total, 440);
  assert.equal(result.savings, 38);
  assert.equal(result.lines["boots"].total, 300);
});
test("Shopify may split discounted and full-price units of the same variant", () => {
  const result = quote([row("shirt", 2, 178, 140), row("shirt", 1, 89, 89)], [{ merchandiseId: "shirt", quantity: 3 }]);
  assert.equal(result.lines.shirt.quantity, 3);
  assert.equal(result.lines.shirt.total, 229);
});
test("complete packs are priced once and prices retain cents", () => {
  assert.equal(quote([row("gloves-240-pack", 1, 479, 479)]).total, 479);
  assert.equal(quote([row("a", 1, 10.1, 8.1), row("b", 1, 10.2, 8.2)]).total, 16.3);
});
test("unavailable quantities, missing prices and incorrect currency cannot produce a quote", () => {
  assert.throws(() => quote([row("shirt", 1, 89, 89)], [{ merchandiseId: "shirt", quantity: 2 }]));
  assert.throws(() => quote([], [{ merchandiseId: "shirt", quantity: 2 }]));
  assert.throws(() => quote([{ ...row("shirt", 1, 89, 89), total: null }]));
  assert.throws(() => quote([{ ...row("shirt", 1, 89, 89), total: { amount: "20", currencyCode: "USD" } }]));
});

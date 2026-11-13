const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const ts = require("typescript");
const code = ts.transpileModule(readFileSync("lib/cart-quote-client.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function harness() {
  const calls = []; let now = 0;
  const exports = {};
  new Function("exports", "fetch", "Date", "AbortSignal", code)(exports,
    (url, options) => new Promise((resolve, reject) => calls.push({ url, options, resolve, reject })),
    { now: () => now }, { timeout: () => undefined });
  return { ...exports, calls, advance: (ms) => { now += ms; } };
}
const line = (qty = 2, id = "123") => ({ pid: "shirt", color: "blue", size: "XXL", qty, variantId: `gid://shopify/ProductVariant/${id}` });
const price = (total = 140) => ({ regular: 178, total, savings: 178 - total, lines: { [line().variantId]: { quantity: 2, regular: 178, total } } });
const reply = (call, quote = price()) => call.resolve({ ok: true, json: async () => ({ ok: true, quote }) });

test("PDP and cart share one in-flight request and reuse its verified amount instantly", async () => {
  const h = harness(); const signature = h.quoteSignature([line()]);
  const first = h.requestCartQuote(signature);
  const second = h.requestCartQuote(signature);
  assert.equal(first, second);
  await Promise.resolve(); assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].url, "/api/shopify/cart/quote");
  reply(h.calls[0]); await first;
  assert.deepEqual(h.cachedCartQuote(signature), price());
  assert.equal((await h.requestCartQuote(signature)).quote.total, 140);
  assert.equal(h.calls.length, 1);
});

test("line order, duplicate lines and translated labels do not trigger duplicate pricing", () => {
  const h = harness();
  const original = [line(), line(1, "456")];
  const rearranged = [line(1, "456"), { ...line(1), color: "כחול", size: "2XL" }, line(1)];
  assert.equal(h.quoteSignature(original), h.quoteSignature(rearranged));
  assert.notEqual(h.quoteSignature([line(3)]), h.quoteSignature([line(2)]));
  assert.notEqual(h.quoteSignature([line(2, "789")]), h.quoteSignature([line(2)]));
  assert.equal(original[0].qty, 2);
});

test("legacy selections without real variant IDs remain distinct", () => {
  const h = harness();
  const a = { ...line(), variantId: undefined };
  assert.notEqual(h.quoteSignature([a]), h.quoteSignature([{ ...a, size: "L" }]));
});

test("verified prices expire after 30 seconds, then need a new Shopify response", async () => {
  const h = harness(); const signature = h.quoteSignature([line()]);
  const first = h.requestCartQuote(signature); await Promise.resolve(); reply(h.calls[0]); await first;
  h.advance(29_999); assert.ok(h.cachedCartQuote(signature));
  h.advance(1); assert.equal(h.cachedCartQuote(signature), undefined);
  const next = h.requestCartQuote(signature); await Promise.resolve();
  assert.equal(h.calls.length, 2); reply(h.calls[1], price(150));
  assert.equal((await next).quote.total, 150);
});

test("retry invalidates cache and an obsolete response cannot overwrite a newer price", async () => {
  const h = harness(); const signature = h.quoteSignature([line()]);
  const first = h.requestCartQuote(signature); await Promise.resolve();
  h.invalidateCartQuotes();
  const second = h.requestCartQuote(signature); await Promise.resolve();
  reply(h.calls[1], price(150)); await second;
  reply(h.calls[0], price(140)); await first;
  assert.equal(h.cachedCartQuote(signature).total, 150);
  h.invalidateCartQuotes(); assert.equal(h.cachedCartQuote(signature), undefined);
});

test("failed prices are never cached and can be retried", async () => {
  const h = harness(); const signature = h.quoteSignature([line()]);
  const first = h.requestCartQuote(signature); await Promise.resolve(); h.calls[0].reject(new Error("offline"));
  assert.equal((await first).ok, false);
  assert.equal(h.cachedCartQuote(signature), undefined);
  const second = h.requestCartQuote(signature); await Promise.resolve(); reply(h.calls[1]);
  assert.equal((await second).ok, true);
});

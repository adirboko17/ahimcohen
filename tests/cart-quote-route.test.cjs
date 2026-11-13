const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const ts = require("typescript");
const code = ts.transpileModule(readFileSync("app/api/shopify/cart/quote/route.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function harness() {
  const calls = [], exports = {};
  new Function("exports", "require", code)(exports, () => ({ quoteShopifyCart: async (lines) => {
    calls.push(lines); return { ok: true, quote: { total: 140, regular: 178, savings: 38, lines: {} } };
  } }));
  return { ...exports, calls };
}
const request = (body) => new Request("http://localhost/api/shopify/cart/quote", { method: "POST", body: JSON.stringify(body) });

test("quote endpoint uses the same verified calculation as checkout and forbids HTTP caching", async () => {
  const h = harness(); const lines = [{ pid: "shirt", qty: 2, variantId: "gid://shopify/ProductVariant/123" }];
  const response = await h.POST(request({ lines }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await response.json()).quote.total, 140);
  assert.deepEqual(h.calls, [lines]);
});

test("empty, oversized and malformed preview requests never call Shopify", async () => {
  const h = harness();
  for (const body of [null, {}, { lines: [] }, { lines: [null] }, { lines: ["bad"] }, { lines: Array(51).fill({ qty: 1 }) }]) {
    const response = await h.POST(request(body));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).ok, false);
  }
  assert.equal(h.calls.length, 0);
});

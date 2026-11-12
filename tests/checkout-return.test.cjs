const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const ts = require("typescript");
function load(file, deps = {}, overrides = {}) {
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", ...Object.keys(overrides), code)(
    (name) => name in deps ? deps[name] : require(name), module, module.exports, ...Object.values(overrides));
  return module.exports;
}
const { rememberCheckout, consumeCheckout, pendingCheckouts, removePurchasedLines } = load("lib/checkout-return.ts");
const line = (variant, qty, instanceId = variant) => ({ key: variant, pid: "shirt", color: variant, size: "M", qty, variantId: variant, instanceId, unitPrice: 35 });
function storage() { const data = new Map(); return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }; }

test("checkout departure preserves all variants; confirmation empties purchased basket once", () => {
  const s = storage();
  const cart = [line("green-M", 3), line("grey-M", 1), line("green-S", 3)];
  rememberCheckout(s, "receipt", cart);
  assert.deepEqual(JSON.parse(s.getItem("ahim-cart")), cart);
  assert.equal(pendingCheckouts(s).length, 1);
  assert.deepEqual(consumeCheckout(s, "receipt"), []);
  assert.equal(s.getItem("ahim-cart"), "[]");
  assert.equal(consumeCheckout(s, "receipt"), null);
});
test("new items, extra quantities, changed selections and re-added items survive payment", () => {
  const purchased = [line("green", 2), line("grey", 1), line("black", 1)];
  const current = [line("green", 3), line("grey", 1, "new-grey"), line("white", 1, "black"), line("hat", 1)];
  assert.deepEqual(removePurchasedLines(current, purchased), [line("green", 1), ...current.slice(1)]);
});
test("a stale status response cannot consume new items or alternate checkout twice", () => {
  const s = storage();
  rememberCheckout(s, "first", [line("green", 2)]);
  rememberCheckout(s, "second", [line("green", 2)]);
  s.setItem("ahim-cart", JSON.stringify([line("green", 3), line("hat", 1)]));
  assert.deepEqual(consumeCheckout(s, "first"), [line("green", 1), line("hat", 1)]);
  assert.equal(consumeCheckout(s, "second"), null);
});
test("unrelated or malformed checkout records cannot clear a basket", () => {
  const s = storage();
  rememberCheckout(s, null, [line("green", 2)]);
  assert.equal(consumeCheckout(s, "unknown"), null);
  s.setItem("ahim-pending-checkouts", '{"receipt":"bad"}');
  assert.deepEqual(pendingCheckouts(s), []);
  assert.equal(JSON.parse(s.getItem("ahim-cart"))[0].qty, 2);
});
test("finishing checkout preparation does not overwrite a newer basket from another tab", () => {
  const s = storage();
  const snapshot = [line("green", 2)];
  const newer = [...snapshot, line("hat", 1)];
  s.setItem("ahim-cart", JSON.stringify(newer));
  rememberCheckout(s, "receipt", snapshot);
  assert.deepEqual(JSON.parse(s.getItem("ahim-cart")), newer);
  assert.deepEqual(consumeCheckout(s, "receipt"), [line("hat", 1)]);
});

function server({ paid = false, failure = false, secret = true, now = 100000 } = {}) {
  const calls = [];
  const api = load("lib/shopify/checkout-status.ts", {
    "server-only": {}, "./config": { shopDomain: () => "test.myshopify.com" },
    "./checkout-payments": { isCheckoutPaid: async (shop, token) => { calls.push({ shop, token }); if (failure) throw Error("offline"); return paid; } },
  }, {
    process: { env: secret ? { SHOPIFY_STOREFRONT_PRIVATE_TOKEN: "private-test-secret" } : {} },
    Date: { now: () => now },
  });
  return { ...api, calls };
}
const token = "test_cart_token_123";
const cartId = `gid://shopify/Cart/${token}?key=NEVER_EXPOSE_THIS_KEY`;
test("only the matching durable payment marker confirms completion without Admin API access", async () => {
    const s = server({ paid: true });
    const receipt = s.checkoutReceipt(cartId);
    assert.ok(receipt);
    assert.ok(!Buffer.from(receipt.split(".")[0], "base64url").toString().includes("NEVER_EXPOSE"));
    assert.equal(await s.checkoutStatus(receipt), "completed");
    assert.deepEqual(s.calls, [{ shop: "test.myshopify.com", token }]);
});
test("no payment marker keeps the basket pending; storage failures never confirm payment", async () => {
  const pending = server();
  assert.equal(await pending.checkoutStatus(pending.checkoutReceipt(cartId)), "pending");
  const failed = server({ failure: true });
  assert.equal(await failed.checkoutStatus(failed.checkoutReceipt(cartId)), "unknown");
});
test("tampering, query injection, and expired receipts cannot authorize clearing", async () => {
  const s = server();
  const receipt = s.checkoutReceipt(cartId);
  assert.equal(s.checkoutReceipt('gid://shopify/Cart/a OR status:paid'), null);
  assert.equal(await s.checkoutStatus(receipt + "x"), "unknown");
  assert.equal(await s.checkoutStatus("success=true"), "unknown");
  assert.equal(s.calls.length, 0);
  assert.equal(await server({ now: 31 * 86400000 }).checkoutStatus(receipt), "expired");
  assert.equal(server({ secret: false }).checkoutReceipt(cartId), null);
});

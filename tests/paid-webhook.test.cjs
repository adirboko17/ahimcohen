const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createHmac } = require("node:crypto");
const { readFileSync } = require("node:fs");
const ts = require("typescript");

const shop = "test.myshopify.com";
const secret = "test-webhook-secret";
const cartToken = "test-cart-token-123";
const order = { id: 123, cart_token: cartToken, financial_status: "paid", cancelled_at: null };
function load(file, dependencies, globals) {
  const source = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", ...Object.keys(globals), source)(
    (name) => name in dependencies ? dependencies[name] : require(name), module, module.exports, ...Object.values(globals));
  return module.exports;
}
function harness({ db = new Map(), storageMissing = false, secretMissing = false, failure = false } = {}) {
  const calls = [];
  const globals = {
    process: { env: {
      SHOPIFY_STOREFRONT_PRIVATE_TOKEN: "test-private-token",
      ...(!secretMissing && { SHOPIFY_WEBHOOK_SECRET: secret }),
      ...(!storageMissing && { UPSTASH_REDIS_REST_URL: "https://redis.example", UPSTASH_REDIS_REST_TOKEN: "redis-test-token" }),
    } },
    fetch: async (url, init) => {
      if (failure) throw Error("offline");
      const command = JSON.parse(init.body);
      calls.push({ url, init, command });
      let result;
      if (command[0] === "GET") result = db.get(command[1]) ?? null;
      else {
        assert.equal(command[0], "SET");
        assert.deepEqual(command.slice(2), ["paid", "EX", 35 * 86400, "NX"]);
        result = db.has(command[1]) ? null : "OK";
        if (result) db.set(command[1], command[2]);
      }
      return { ok: true, json: async () => ({ result }) };
    },
  };
  const dependencies = { "server-only": {}, "./config": { shopDomain: () => shop } };
  const payments = load("lib/shopify/checkout-payments.ts", dependencies, globals);
  dependencies["./checkout-payments"] = payments;
  const webhook = load("lib/shopify/paid-webhook.ts", dependencies, globals);
  const status = load("lib/shopify/checkout-status.ts", dependencies, globals);
  const route = load("app/api/shopify/webhooks/orders-paid/route.ts", { "@/lib/shopify/paid-webhook": webhook }, globals);
  return { ...route, ...status, db, calls };
}
function request(body = order, headers = {}, signatureBody) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  return new Request("https://store.example/api/shopify/webhooks/orders-paid", { method: "POST", body: raw, headers: {
    "Content-Type": "application/json", "X-Shopify-Topic": "orders/paid", "X-Shopify-Shop-Domain": shop,
    "X-Shopify-Hmac-Sha256": createHmac("sha256", secret).update(signatureBody ?? raw).digest("base64"), ...headers,
  } });
}
test("signed paid webhook persists completion across server instances; unpaid cart stays pending", async () => {
  const a = harness();
  const receipt = a.checkoutReceipt(`gid://shopify/Cart/${cartToken}?key=secret`);
  assert.equal(await a.checkoutStatus(receipt), "pending");
  assert.equal((await a.POST(request())).status, 200);
  const b = harness({ db: a.db });
  assert.equal(await b.checkoutStatus(receipt), "completed");
  assert.equal(await b.checkoutStatus(b.checkoutReceipt("gid://shopify/Cart/another-cart-123")), "pending");
  assert.equal((await b.POST(request())).status, 200);
  assert.equal(a.db.size, 1);
  for (const call of [...a.calls, ...b.calls]) {
    assert.equal(call.init.cache, "no-store");
    assert.ok(!call.init.body.includes(cartToken));
    assert.ok(!call.init.body.includes("financial_status"));
  }
});
test("forged signatures, modified raw body and wrong shop never write payment markers", async () => {
  const h = harness();
  assert.equal((await h.POST(request(order, { "X-Shopify-Hmac-Sha256": "" }))).status, 401);
  assert.equal((await h.POST(request(order, { "X-Shopify-Hmac-Sha256": "A".repeat(43) + "=" }))).status, 401);
  assert.equal((await h.POST(request(JSON.stringify(order) + " ", {}, JSON.stringify(order)))).status, 401);
  assert.equal((await h.POST(request(order, { "X-Shopify-Shop-Domain": "other.myshopify.com" }))).status, 403);
  assert.equal(h.db.size, 0);
});
test("unpaid, partial, authorized, cancelled, unrelated topics and cartless orders do not clear carts", async () => {
  const h = harness();
  for (const financial_status of ["pending", "authorized", "partially_paid", "voided", "refunded"]) {
    assert.equal((await h.POST(request({ ...order, financial_status }))).status, 200);
  }
  assert.equal((await h.POST(request({ ...order, cancelled_at: "2026-01-01" }))).status, 200);
  assert.equal((await h.POST(request({ ...order, cart_token: null }))).status, 200);
  assert.equal((await h.POST(request(order, { "X-Shopify-Topic": "orders/create" }))).status, 200);
  assert.equal(h.db.size, 0);
});
test("acknowledgement waits for durable storage; missing config and downtime return retryable errors", async () => {
  for (const options of [{ secretMissing: true }, { storageMissing: true }, { failure: true }]) {
    const h = harness(options);
    assert.equal((await h.POST(request())).status, 503);
    assert.equal(h.db.size, 0);
    if (!options.secretMissing) assert.equal(await h.checkoutStatus(h.checkoutReceipt(`gid://shopify/Cart/${cartToken}`)), "unknown");
  }
});
test("a failed delivery can be retried successfully without losing the paid event", async () => {
  const db = new Map();
  assert.equal((await harness({ db, failure: true }).POST(request())).status, 503);
  const healthy = harness({ db });
  assert.equal((await healthy.POST(request())).status, 200);
  assert.equal(await healthy.checkoutStatus(healthy.checkoutReceipt(`gid://shopify/Cart/${cartToken}`)), "completed");
});
test("invalid JSON and oversized bodies are rejected without persisting customer data", async () => {
  const h = harness();
  assert.equal((await h.POST(request("{"))).status, 400);
  assert.equal((await h.POST(request(" ".repeat(2 * 1024 * 1024 + 1)))).status, 413);
  assert.equal((await h.POST(request({ ...order, id: null }))).status, 400);
  assert.equal(h.db.size, 0);
});

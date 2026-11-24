const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { test } = require("node:test");
const ts = require("typescript");

const compiled = ts.transpileModule(readFileSync(resolve(__dirname, "../lib/admin/reviews.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

const customer = {
  id: "00000000-0000-4000-8000-000000000001", productId: "shirt", author: "לקוח", rating: 4,
  text: "בדיקה", published: false, source: "customer", createdAt: "2026-11-24T12:00:00.000Z",
};
const draft = { ...customer, id: "00000000-0000-4000-8000-000000000002", source: "admin" };

function load({ initialReviews = [], remote = false, fetch = () => assert.fail("unexpected remote request") } = {}) {
  const store = { reviews: structuredClone(initialReviews) };
  const deps = {
    "server-only": {},
    "@/lib/shopify/config": { shopDomain: () => "store.example" },
    "@/lib/shopify/load-catalog": { loadShopCatalog: () => assert.fail("approval does not need a catalog read") },
    "./storage": { readAdminStore: async () => store, changeAdminStore: async (change) => change(store) },
  };
  const runtime = { env: remote ? { SUPABASE_URL: "https://db.example", SUPABASE_SECRET_KEY: "server-key" } : {} };
  const module = { exports: {} };
  new Function("require", "module", "exports", "process", "fetch", compiled)(
    (name) => deps[name] ?? require(name), module, module.exports, runtime, fetch,
  );
  const command = (operation, id) => {
    const data = new FormData();
    data.set("operation", operation);
    data.set("id", id);
    data.set("author", "Ignored");
    data.set("rating", "1");
    return module.exports.saveAdminReview(data);
  };
  return { store, command, publishedReviews: module.exports.publishedReviews };
}

test("approval exposes the customer review without changing its contents or publishing an admin draft", async () => {
  const { store, command, publishedReviews } = load({ initialReviews: [customer, draft] });
  assert.deepEqual(await publishedReviews(store.reviews, "shirt"), []);
  assert.equal((await command("approve", customer.id)).ok, true);
  assert.equal((await command("approve", customer.id)).ok, true);
  assert.equal((await command("approve", draft.id)).ok, false);
  assert.deepEqual(store.reviews, [{ ...customer, published: true }, draft]);
  assert.deepEqual((await publishedReviews(store.reviews, "shirt")).map(({ id }) => id), [customer.id]);
  assert.equal((await command("delete", customer.id)).ok, true);
  assert.equal((await command("approve", customer.id)).ok, false);
  assert.deepEqual(store.reviews, [draft]);
});

test("remote approval patches only the selected customer's publication flag within the current shop", async () => {
  let requests = 0;
  const { command } = load({ remote: true, fetch: async (url, options) => {
    requests++;
    assert.equal(url.pathname, "/rest/v1/ahim_product_reviews");
    assert.equal(url.searchParams.get("id"), `eq.${customer.id}`);
    assert.equal(url.searchParams.get("shop_domain"), "eq.store.example");
    assert.equal(url.searchParams.get("source"), "eq.customer");
    assert.equal(options.method, "PATCH");
    assert.deepEqual(JSON.parse(options.body), { published: true });
    return Response.json(requests === 1 ? [{ id: customer.id }] : []);
  } });
  assert.equal((await command("approve", "")).ok, false);
  assert.equal((await command("approve", customer.id)).ok, true);
  assert.equal((await command("approve", customer.id)).ok, false);
  assert.equal(requests, 2);
});

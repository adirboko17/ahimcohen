const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { AsyncLocalStorage } = require("node:async_hooks");
const { transpileModule, ModuleKind, ScriptTarget } = require("typescript");

// Exercise the installed Next cache implementation in a request context,
// with deterministic storage and Shopify responses (no network or credentials).
globalThis.AsyncLocalStorage = AsyncLocalStorage;
const { unstable_cache } = require("next/cache");
const { workAsyncStorage } = require("next/dist/server/app-render/work-async-storage.external");
const source = transpileModule(
  readFileSync(resolve(__dirname, "../lib/shopify/load-catalog.ts"), "utf8"),
  { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2020 } },
).outputText;

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function harness() {
  const entries = new Map();
  const state = { loads: 0, price: 100, domain: "one.myshopify.com", gate: null, fail: false, variants: [] };
  const pageInfo = { hasNextPage: false, endCursor: null };
  const storage = {
    generateSimpleCacheKey: async (key) => key,
    get: async (key) => entries.get(key) || null,
    set: async (key, value) => {
      assert.ok(Buffer.byteLength(JSON.stringify(value)) < 2 * 1024 * 1024);
      entries.set(key, { value, isStale: false });
    },
  };
  const dependencies = {
    "server-only": {},
    // Treat each call as an independent render to stress cross-request deduplication.
    react: { cache: (fn) => fn },
    "next/cache": { unstable_cache },
    "@/lib/catalog": { CATS: [{ id: "work", name: "Work", subs: ["Shirts", "Uniforms"] }] },
    "./config": {
      shopDomain: () => state.domain,
      storefrontApiVersion: () => "2026-10",
      metafieldIdentifiers: () => [],
    },
    "./collections": {
      fetchCollectionsPage: async () => {
        state.loads++;
        if (state.gate) await state.gate.promise;
        if (state.fail) throw new Error("Shopify unavailable");
        return {
          items: ["Shirts", "Uniforms"].map((title) => ({ handle: title, title })),
          pageInfo,
        };
      },
    },
    "./products": {
      fetchCollectionProductsPage: async () => ({
        products: {
          items: [{
            handle: "shirt", title: "Work shirt", vendor: "Brand", description: "Cotton",
            images: [], variants: state.variants, priceRange: { min: { amount: String(state.price) } },
          }],
          pageInfo,
        },
      }),
      fetchProductsPage: async () => { throw new Error("Unexpected fallback"); },
    },
  };
  const module = { exports: {} };
  new Function("require", "module", "exports", source)((name) => {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  }, module, module.exports);

  function request() {
    const store = { incrementalCache: storage, route: "/c/work" };
    const value = workAsyncStorage.run(store, () => module.exports.loadShopCatalog());
    return {
      value,
      settle: async () => {
        await value;
        await Promise.all(Object.values(store.pendingRevalidates || {}));
      },
    };
  }
  return {
    state, request,
    expire: () => { for (const entry of entries.values()) entry.isStale = true; },
  };
}

test("simultaneous cold requests share one Shopify load and warm requests reuse it", async () => {
  const h = harness();
  h.state.gate = deferred();
  const requests = Array.from({ length: 6 }, () => h.request());
  await new Promise(setImmediate);
  assert.equal(h.state.loads, 1);
  h.state.gate.resolve();
  const catalogs = await Promise.all(requests.map((r) => r.value));
  await Promise.all(requests.map((r) => r.settle()));
  for (const catalog of catalogs) {
    assert.equal(catalog.products.length, 1);
    assert.deepEqual(catalog.products[0].subs.sort(), ["Shirts", "Uniforms"]);
  }
  assert.deepEqual(await h.request().value, JSON.parse(JSON.stringify(catalogs[0])));
  assert.equal(h.state.loads, 1);
});

test("expired catalog returns immediately while one shared refresh updates prices", { timeout: 5000 }, async () => {
  const h = harness();
  await h.request().settle();
  h.expire();
  h.state.price = 125;
  h.state.gate = deferred();
  const requests = [h.request(), h.request(), h.request()];
  // These resolve even though the refresh gate is still closed.
  for (const request of requests) assert.equal((await request.value).products[0].price, 100);
  assert.equal(h.state.loads, 2);
  h.state.gate.resolve();
  await Promise.all(requests.map((r) => r.settle()));
  assert.equal((await h.request().value).products[0].price, 125);
  assert.equal(h.state.loads, 2);
});

test("failed refresh preserves the last catalog and a later request can retry", async (t) => {
  const h = harness();
  await h.request().settle();
  h.expire();
  h.state.fail = true;
  const errors = [];
  t.mock.method(console, "error", (...args) => errors.push(args));
  const failed = h.request();
  assert.equal((await failed.value).products[0].price, 100);
  await failed.settle();
  assert.equal(errors.length, 1);
  h.state.fail = false;
  h.state.price = 150;
  await h.request().settle();
  assert.equal((await h.request().value).products[0].price, 150);
});

test("a failed cold load does not poison subsequent requests", async () => {
  const h = harness();
  h.state.fail = true;
  await assert.rejects(h.request().value, /Shopify unavailable/);
  h.state.fail = false;
  const retry = h.request();
  await retry.settle();
  assert.equal((await retry.value).products.length, 1);
  assert.equal(h.state.loads, 2);
});

test("changing stores cannot reuse another store's cached catalog", async () => {
  const h = harness();
  await h.request().settle();
  h.state.domain = "two.myshopify.com";
  h.state.price = 200;
  const otherStore = h.request();
  await otherStore.settle();
  assert.equal((await otherStore.value).products[0].price, 200);
  assert.equal(h.state.loads, 2);
});

test("variant photos keep their color and size association in fresh and cached catalogs", async () => {
  const h = harness();
  h.state.variants = [
    { id: "navy-m", title: "Navy / M", availableForSale: true, selectedOptions: [{ name: "Color", value: "navy" }, { name: "Size", value: "M" }], price: { amount: "100" }, image: { url: "https://example.com/navy.jpg" } },
    { id: "white-l", title: "White / L", availableForSale: true, selectedOptions: [{ name: "Color", value: "white" }, { name: "Size", value: "L" }], price: { amount: "100" }, image: null },
  ];
  const request = h.request();
  await request.settle();
  for (const catalog of [await request.value, await h.request().value]) {
    const [navy, white] = catalog.products[0].choices;
    assert.equal(navy.color, "navy");
    assert.equal(navy.size, "M");
    assert.equal(navy.image, "https://example.com/navy.jpg");
    assert.equal(white.image, undefined);
  }
});

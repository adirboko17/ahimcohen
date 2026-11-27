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
const fetchSource = transpileModule(
  readFileSync(resolve(__dirname, "../lib/shopify/fetch-catalog.ts"), "utf8"),
  { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2020 } },
).outputText;
const colors = {};
new Function("exports", transpileModule(readFileSync(resolve(__dirname, "../lib/colors.ts"), "utf8"), {
  compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2020 },
}).outputText)(colors);
const categoryPlacement = {};
new Function("exports", transpileModule(readFileSync(resolve(__dirname, "../lib/category-placement.ts"), "utf8"), {
  compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2020 },
}).outputText)(categoryPlacement);

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function harness() {
  const entries = new Map();
  const state = { loads: 0, price: 100, domain: "one.myshopify.com", gate: null, fail: false, variants: [], productCount: 1, extraBrandProducts: [], bootstrap: null };
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
    "@/lib/colors": colors,
    "@/lib/category-placement": categoryPlacement,
    "node:zlib": require("node:zlib"),
    "node:util": require("node:util"),
    // Treat each call as an independent render to stress cross-request deduplication.
    react: { cache: (fn) => fn },
    "next/cache": { unstable_cache },
    "next/server": { after: fn => workAsyncStorage.getStore().afterTasks.push(fn) },
    "./catalog-bootstrap": { readCatalogBootstrap: async scope => state.bootstrap?.scope === scope ? state.bootstrap.encoded : null },
    "@/lib/catalog": {
      CATS: [
        { id: "work", name: "Work", subs: ["Shirts", "Uniforms"] },
        { id: "pro", name: "ביגוד מקצועי", subs: ["חולצות", "מכנסיים"] },
        { id: "winter", name: "ביגוד חורף", subs: ["מעילים", "ביגוד תרמי", "סווטשירטים וקפוצ'ונים"] },
        { id: "acc", name: "אביזרים", subs: ["גרביים", "חגורות", "כובעים"] },
        { id: "shoes", name: "נעליים", subs: ["נעלי בטיחות", "נעלי עבודה ללא מגן", "סניקרס ונעלי טיולים"] },
      ],
      productSubcategories: (product, categoryId) => product.categorySubs?.[categoryId] ?? [],
    },
    "@/lib/admin/storage": { readAdminStore: async () => ({ categoryPlacements: state.placements }) },
    "./config": {
      shopDomain: () => state.domain,
      storefrontApiVersion: () => "2026-10",
      metafieldIdentifiers: () => [],
    },
    "./product-brand": { productBrand: product => product.vendor },
    "./collections": {
      fetchCollectionsPage: async () => {
        state.loads++;
        if (state.gate) await state.gate.promise;
        if (state.fail) throw new Error("Shopify unavailable");
        return {
          items: [...["Shirts", "Uniforms"].map((title) => ({ handle: title, title })), ...(state.collections ?? [])],
          pageInfo,
        };
      },
    },
    "./products": {
      fetchProductsPage: async ({ first, after, includeCollections }) => {
        assert.equal(includeCollections, true);
        const catalog = new Map();
        for (const handle of ["Shirts", "Uniforms", ...(state.collections ?? []).map(item => item.handle)]) {
          const members = state.collectionProducts?.[handle] ?? Array.from({ length: state.productCount }, (_, index) => ({
            handle: handle === "supplier-sale" ? "road-shoe" : index === 0 ? "shirt" : "shirt-" + index,
            title: "Work shirt", vendor: "Brand", description: "Cotton",
            images: [], variants: state.variants, priceRange: { min: { amount: String(state.price) } },
          }));
          for (const product of members) {
            if (!catalog.has(product.handle)) catalog.set(product.handle, {
              ...product, id: product.handle, collections: { items: [], pageInfo },
            });
            catalog.get(product.handle).collections.items.push(handle);
          }
        }
        for (const product of state.extraBrandProducts) catalog.set(product.handle, product);
        for (const [handle, memberships] of Object.entries(state.collectionOverrides ?? {})) {
          catalog.get(handle).collections = memberships;
        }
        const start = Number(after ?? 0);
        const end = start + first;
        return {
          items: [...catalog.values()].slice(start, end),
          pageInfo: end < catalog.size ? { hasNextPage: true, endCursor: String(end) } : pageInfo,
        };
      },
      fetchProductCollectionsPage: async (id, after) => {
        const page = state.collectionContinuation?.[id]?.[after];
        assert.ok(page, "Unexpected product collection page");
        return page;
      },
    },
  };
  const resolveDependency = (name) => {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  };
  const fetchModule = { exports: {} };
  new Function("require", "module", "exports", fetchSource)(resolveDependency, fetchModule, fetchModule.exports);
  dependencies['./fetch-catalog'] = fetchModule.exports;
  const module = { exports: {} };
  new Function("require", "module", "exports", source)(resolveDependency, module, module.exports);

  function request() {
    const store = { incrementalCache: storage, route: "/c/work", afterTasks: [] };
    const value = workAsyncStorage.run(store, () => module.exports.loadShopCatalog());
    return {
      value,
      settle: async () => {
        await value;
        await Promise.all(Object.values(store.pendingRevalidates || {}));
        await Promise.all(store.afterTasks.map(fn => fn()));
      },
    };
  }
  return {
    state, request,
    seed: price => {
      state.bootstrap = {
        scope: JSON.stringify([state.domain, "2026-10", []]),
        encoded: require('node:zlib').gzipSync(JSON.stringify({ categories: [], products: [{ id: 'shirt', price }] })).toString('base64'),
      };
    },
    storedBytes: () => Math.max(0, ...[...entries.values()].map((entry) => Buffer.byteLength(JSON.stringify(entry.value)))),
    expire: () => { for (const entry of entries.values()) entry.isStale = true; },
  };
}

test("an approved collection ID adds its clean label to the parent filter and only to members of that collection", async () => {
  const { state, request } = harness();
  state.collections = [{ id: "gid://shopify/Collection/42", handle: "supplier-sale", title: "נעלי ריצה כביש Up to 50%off" }];
  state.placements = [{ collectionId: "gid://shopify/Collection/42", parentId: "work", label: "נעלי ריצה כביש" }];
  const pending = request();
  const { categories, products } = await pending.value;
  assert.deepEqual(categories[0].subs, ["Shirts", "Uniforms", "נעלי ריצה כביש"]);
  assert.deepEqual(products.find(product => product.id === "road-shoe").categorySubs.work, ["נעלי ריצה כביש"]);
  assert.deepEqual(products.find(product => product.id === "shirt").categorySubs.work.sort(), ["Shirts", "Uniforms"]);
  await pending.settle();
});

test("a category created in admin and its subcategory classify published products on the storefront", async () => {
  const { state, request } = harness();
  const id = "category-camping";
  state.collections = [
    { id: "category", handle: "ahim-category-aaaaaaaaaaaaaaaaaaaaaaaa", title: "Camping" },
    { id: "subcategory", handle: "supplier-sale", title: "Hammocks" },
  ];
  state.placements = [
    { collectionId: "category", parentId: id, label: "", parentName: "Camping" },
    { collectionId: "subcategory", parentId: id, label: "Hammocks" },
  ];
  const pending = request();
  const { categories, products } = await pending.value;
  assert.deepEqual(categories.find(category => category.id === id)?.subs, ["Hammocks"]);
  assert.deepEqual(products.find(product => product.id === "road-shoe")?.categorySubs[id], ["Hammocks"]);
  assert.ok(products.find(product => product.id === "shirt")?.cats.includes(id));
  await pending.settle();
});

test("work shoes and the existing outdoor collection share the shoes category", async () => {
  const { state, request } = harness();
  const shoe = (handle) => ({ handle, title: handle, vendor: "Brand", description: "", images: [], variants: [], priceRange: { min: { amount: "100" } } });
  const handle = "ahim-category-aaaaaaaaaaaaaaaaaaaaaaaa";
  state.collections = [
    { id: "work-shoes", handle: "work-shoes", title: "נעלי עבודה ובטיחות", image: { url: "https://example.com/work-shoes.jpg" } },
    { id: "safety", handle: "safety", title: "נעלי בטיחות" },
    { id: "outdoor", handle, title: "סניקרס ונעלי טיולים" },
  ];
  state.collectionProducts = { "work-shoes": [shoe("work-only")], safety: [shoe("safety-only")], [handle]: [shoe("hiking-only")] };
  state.placements = [{ collectionId: "outdoor", parentId: "outdoor-footwear", label: "סניקרס ונעלי טיולים" }];
  const pending = request();
  const { categories, products } = await pending.value;
  assert.deepEqual(categories.find(category => category.id === "shoes"), {
    id: "shoes", name: "נעליים", subs: ["נעלי בטיחות", "סניקרס ונעלי טיולים"], image: "https://example.com/work-shoes.jpg",
  });
  assert.equal(categories.some(category => category.id === "outdoor-footwear"), false);
  const byId = new Map(products.map(product => [product.id, product]));
  assert.deepEqual(byId.get("work-only").cats, ["shoes"]);
  assert.deepEqual(byId.get("safety-only").categorySubs, { shoes: ["נעלי בטיחות"] });
  assert.deepEqual(byId.get("hiking-only").categorySubs, { shoes: ["סניקרס ונעלי טיולים"] });
  assert.deepEqual(byId.get("hiking-only").cats, ["shoes"]);
  await pending.settle();
});

test("Redback remains a brand and legacy collections are resolved by individual product type", async () => {
  const { state, request } = harness();
  const item = (handle, title) => ({
    handle, title, vendor: "Redback", productType: "", description: "", images: [], variants: [], priceRange: { min: { amount: "100" } },
  });
  const coat = item("softshell", "VICTORIA SOFTSHELL");
  const shirt = item("cotton", "TAIPAN WASHED COTTON");
  const thermal = item("thermal", "INSULATED THERMAL – SHIRT");
  const pants = item("perth", "PERTH – nylon");
  const sock = item("sock", "THERMO LIGHT / גרב תרמית");
  const cap = item("cap", "כובע מצחייה דגם Sport");
  const belt = item("belt", "חגורת עור");
  state.collections = [
    { handle: "old-brand", title: "Redback" }, { handle: "old-shirts", title: "REDBACK חולצות" },
    { handle: "old-pants", title: "REDBACK מכנסיים מכנסיים" }, { handle: "old-socks", title: "REDBACK גרביים" },
    { handle: "old-belts", title: "REDBACK חגורות" }, { handle: "plain-shirts", title: "חולצות" },
  ];
  state.collectionProducts = {
    "old-brand": [coat, shirt, thermal, pants, sock, cap, belt], "old-shirts": [coat, shirt, thermal],
    "old-pants": [pants], "old-socks": [sock], "old-belts": [belt],
    "plain-shirts": [item("existing-pro", "חולצה לשימוש מקצועי")],
  };
  state.extraBrandProducts = [item("hoodie", "GIBSON COTTON HOODIE"), item("uscjzs", "USCJZS עם כיפת מגן")];
  const pending = request();
  const { categories, products } = await pending.value;
  const expected = {
    softshell: ["winter", "מעילים"], cotton: ["pro", "חולצות"], thermal: ["winter", "ביגוד תרמי"],
    perth: ["pro", "מכנסיים"], sock: ["acc", "גרביים"], cap: ["acc", "כובעים"],
    belt: ["acc", "חגורות"], hoodie: ["winter", "סווטשירטים וקפוצ'ונים"], "existing-pro": ["pro", "חולצות"],
    uscjzs: ["shoes", "נעלי בטיחות"],
  };
  assert.ok(!categories.some(category => category.id === "redback"));
  for (const [handle, [category, sub]] of Object.entries(expected)) {
    const product = products.find(product => product.id === handle);
    assert.equal(product.brand, "Redback");
    assert.deepEqual(product.cats, [category]);
    assert.deepEqual(product.categorySubs, { [category]: [sub] });
    assert.ok(categories.find(item => item.id === category).subs.includes(sub));
  }
  await pending.settle();
});

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

test("brand pages include live published products without a collection and skip deleted handles", async () => {
  const h = harness();
  h.state.extraBrandProducts = [{ handle: "brand-only", title: "Brand shoe", vendor: "Redback", description: "", images: [], variants: [], priceRange: { min: { amount: "200" } } }];
  const catalog = await h.request().value;
  assert.equal(catalog.products.filter(product => product.id === "shirt").length, 1);
  assert.equal(catalog.products.find(product => product.id === "brand-only").brand, "Redback");
  assert.ok(!catalog.products.some(product => product.id === "deleted-product"));
});

test("published products after page eight keep category memberships from later collection pages", async () => {
  const h = harness();
  h.state.productCount = 420;
  const handle = "shirt-419";
  h.state.collectionOverrides = {
    [handle]: { items: ["Shirts"], pageInfo: { hasNextPage: true, endCursor: "memberships-1" } },
  };
  h.state.collectionContinuation = {
    [handle]: { "memberships-1": { items: ["Uniforms"], pageInfo: { hasNextPage: false, endCursor: null } } },
  };
  const request = h.request();
  const catalog = await request.value;
  await request.settle();
  assert.equal(catalog.products.length, 420);
  assert.deepEqual(catalog.products.find(product => product.id === handle).categorySubs, { work: ["Shirts", "Uniforms"] });
});

test("Shopify option aliases retain the chosen size, color, variant ID and availability", async () => {
  const h = harness();
  const cases = [
    ["מידות מכנסיים", "32", "צבע", "שחור"],
    ["מידות מכנסיים", "34", "צבע", "שחור"],
    ["מידות גרביים", "35-39", "צבע גרביים", "לבן"],
    ["מידת נעליים", "40", "Color", "black"],
    ["חגורות עור", '97 ס"מ -S', "צבע", "חום"],
    ["scott גרביים", "L 42-44", "צבע", "אפור"],
    [" Size ", "M", "מארזים", "מארז נייבי / שחור"],
  ];
  h.state.variants = cases.map(([sizeName, size, colorName, color], i) => ({
    id: String(i), title: color + " / " + size, price: { amount: "99" }, availableForSale: i % 2 === 0,
    selectedOptions: [{ name: colorName, value: color }, { name: sizeName, value: size }],
  }));
  const [product] = (await h.request().value).products;
  assert.deepEqual(product.choices.map(v => [v.id, v.size, v.color, v.available]),
    cases.map(([, size, , color], i) => [String(i), size, color, i % 2 === 0]));
  assert.equal(colors.colorLabel("מארז נייבי / שחור"), colors.colorLabel("נייבי / שחור"));
  assert.equal(colors.packColors("מארז כפפות / חגורה"), undefined);
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

test("a catalog exceeding 2 MB is cached losslessly and reused across page requests", async () => {
  const h = harness();
  h.state.productCount = 180;
  h.state.variants = Array.from({ length: 60 }, (_, index) => ({
    id: `gid://shopify/ProductVariant/${index}`, title: `כחול / ${index}`, sku: `sku-${index}`,
    availableForSale: index % 2 === 0,
    selectedOptions: [{ name: "Color", value: "כחול" }, { name: "Size", value: String(index) }],
    price: { amount: String(100 + index) },
    image: { url: `https://cdn.shopify.com/s/files/1/0863/4017/4130/files/product-photo-for-colour-${index % 3}-long-identifier-1234567890.jpg?v=1762214026` },
  }));
  const cold = h.request();
  const catalog = await cold.value;
  await cold.settle();
  assert.ok(Buffer.byteLength(JSON.stringify(catalog)) > 2 * 1024 * 1024, "Fixture must exceed the old cache limit");
  assert.ok(h.storedBytes() < 2 * 1024 * 1024, "Serialized cache entry must fit Next's limit");
  assert.deepEqual(await h.request().value, catalog);
  assert.equal(h.state.loads, 1, "A warm page must not fetch Shopify again");
  assert.equal(catalog.products[179].choices[59].color, "כחול");
  assert.equal(catalog.products[179].choices[59].price, 159);
  assert.equal(catalog.products[179].choices[59].available, false);
  assert.equal(catalog.products[179].choices[59].image, h.state.variants[59].image.url);
});

test("empty cache serves the build snapshot before Shopify resolves, then adopts live data", { timeout: 5000 }, async () => {
  const h = harness(); h.seed(80); h.state.gate = deferred();
  const requests = Array.from({ length: 3 }, () => h.request());
  for (const request of requests) assert.equal((await request.value).products[0].price, 80);
  assert.equal(h.state.loads, 1, "cold requests share the background refresh");
  h.state.gate.resolve();
  await Promise.all(requests.map(request => request.settle()));
  assert.equal((await h.request().value).products[0].price, 100, "newer live data supersedes the seed");
  assert.equal(h.state.loads, 1);
});

test("warm live cache wins over an older packaged snapshot", async () => {
  const h = harness(); h.seed(80);
  const first = h.request(); await first.settle();
  assert.equal((await first.value).products[0].price, 100);
  assert.equal((await h.request().value).products[0].price, 100);
});

test("cold Shopify failure retains the seed without caching the failure and retries later", async (t) => {
  const h = harness(); h.seed(80); h.state.fail = true;
  t.mock.method(console, 'error', () => {});
  const first = h.request(); await first.settle();
  assert.equal((await first.value).products[0].price, 80);
  assert.equal(h.storedBytes(), 0, "the fallback must never poison the persistent live cache");
  h.state.fail = false; h.state.price = 120;
  const retry = h.request(); await retry.settle();
  assert.equal((await retry.value).products[0].price, 120);
});

test("a packaged catalog cannot leak across Shopify store scopes", async () => {
  const h = harness(); h.seed(80); h.state.domain = 'two.myshopify.com'; h.state.price = 250;
  assert.equal((await h.request().value).products[0].price, 250);
});

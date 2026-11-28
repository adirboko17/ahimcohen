const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { test } = require("node:test");
const { transpileModule, ModuleKind, ScriptTarget } = require("typescript");

function load(file, dependencies = {}) {
  const { outputText } = transpileModule(readFileSync(resolve(__dirname, "..", file), "utf8"), {
    compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
  });
  const module = { exports: {} };
  new Function("require", "module", "exports", outputText)(name => {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency ${name}`);
    return dependencies[name];
  }, module, module.exports);
  return module.exports;
}

const placement = load("lib/category-placement.ts");
const { sub: outerwear, previous: [coats, sweats] } = placement.winterOuterwear;
const taxonomy = [
  { id: "work", name: "עבודה", subs: ["חולצות", "מכנסיים"] },
  { id: "gear", name: "ציוד", subs: ["כפפות"] },
  { id: "winter", name: "חורף", subs: [outerwear] },
];
const catalogHelpers = { CATS: taxonomy, productSubcategories: (product, id) => product.categorySubs[id] ?? [] };
const sorting = load("lib/category-sorting.ts", { "./catalog": catalogHelpers, "./category-placement": placement });
const path = (parentId, sub = "") => ({ parentId, sub });

test("cached vest placements and saved category edits follow the move to safety", () => {
  const { sub } = placement.reflectiveVests;
  const old = path("pro", sub);
  const current = path("safety", sub);
  const product = { id: "vest", cat: "pro", cats: ["pro"], sub, categorySubs: { pro: [sub] } };
  const base = [{ id: "pro", name: "ביגוד מקצועי", subs: [placement.workShorts] }, { id: "safety", name: "מוצרי בטיחות", subs: [sub] }];
  assert.deepEqual(placement.storefrontCategories(base, [{ collectionId: "v", parentId: "pro", label: sub }]), base);
  const result = sorting.applyCategoryAdjustments([product], [{ ...base[0], subs: [sub] }], base, {}, {});
  assert.deepEqual(result.products[0].categorySubs, { safety: [sub] });
  assert.deepEqual(result.categories.find(c => c.id === "safety").subs, [sub]);
  assert.deepEqual(sorting.adjustedCategoryPaths([current], { added: [], removed: [old] }), []);
  assert.deepEqual(sorting.adjustedCategoryPaths([], { added: [old], removed: [] }), [current]);
});
const first = "gid://shopify/Product/1";
const second = "gid://shopify/Product/2";
const products = [
  { id: "one", cat: "work", sub: "חולצות", cats: ["work", "winter"], categorySubs: { work: ["חולצות", "מכנסיים"], winter: [coats, sweats] } },
  { id: "two", cat: "work", sub: "חולצות", cats: ["work"], categorySubs: { work: ["חולצות"] } },
];
const catalog = {
  products, categories: [taxonomy[0], taxonomy[2]],
  categorySources: { one: { id: first, direct: ["work"] }, two: { id: second, direct: [] } },
};

function harness(initialStore = {}) {
  let store = initialStore;
  let signedIn = true;
  const { adminRequestOrigin } = load("lib/admin/request-origin.ts", { "server-only": {} });
  const storage = {
    changeAdminStore: async change => {
      const draft = structuredClone(store);
      await change(draft);
      store = draft;
    },
    readAdminStore: async () => store,
    AdminEditBusy: class extends Error {},
  };
  const service = load("lib/admin/category-sorting.ts", {
    "server-only": {}, "@/lib/catalog": catalogHelpers, "@/lib/category-placement": placement,
    "@/lib/category-sorting": sorting, "@/lib/shopify/load-catalog": { loadShopCatalog: async () => catalog }, "./storage": storage,
  });
  const route = load("app/admin/category-sort/route.ts", {
    "@/lib/admin/access": { isAdmin: async () => signedIn }, "@/lib/admin/category-sorting": service,
    "@/lib/admin/request-origin": { adminRequestOrigin }, "@/lib/admin/storage": storage, "@/lib/category-sorting": sorting,
  });
  return {
    get store() { return store; },
    effective: () => sorting.applyCategoryAdjustments(products, catalog.categories, taxonomy, catalog.categorySources, store.categoryAdjustments ?? {}),
    post: (body, origin = "https://example.com") => route.POST(new Request("https://example.com/admin/category-sort", {
      method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json", host: "example.com", origin },
    })),
    get: route.GET,
    signOut: () => { signedIn = false; },
  };
}

const id = "8de08762-1ee8-46e1-a756-920a7c85f68a";
const nextId = "4cc2758e-6310-4c00-9b44-99f77d4e5603";
const destination = path("gear", "כפפות");
const move = { operation: "move", id, source: path("work", "חולצות"), target: destination, products: ["one", "two"] };

test("a bulk move removes the selected subcategory, preserves other paths and can be undone after a reload", async () => {
  const h = harness();
  assert.equal((await h.post(move)).status, 200);
  assert.equal((await (await h.post(move)).json()).count, 2);
  const effective = h.effective();
  assert.deepEqual(effective.products[0].categorySubs, { work: ["מכנסיים"], winter: [outerwear], gear: ["כפפות"] });
  assert.deepEqual(effective.products[1].cats, ["gear"]);
  assert.deepEqual(effective.categories.find(category => category.id === "gear").subs, ["כפפות"]);
  assert.equal((await (await h.get()).json()).lastEdit.id, id);
  assert.equal((await h.post({ operation: "undo", id })).status, 200);
  assert.deepEqual(h.store.categoryAdjustments, {});
  assert.equal((await h.post({ operation: "undo", id })).status, 200);
  assert.equal((await (await h.get()).json()).lastEdit, null);
});

test("moving from a main category removes its branch, and undo restores earlier manual choices", async () => {
  const h = harness();
  await h.post({ ...move, operation: "add" });
  const initial = structuredClone(h.store.categoryAdjustments);
  assert.deepEqual(h.effective().products[0].cats, ["work", "winter", "gear"]);
  assert.equal((await h.post({ ...move, id: nextId, source: path("work"), target: path("work", "מכנסיים") })).status, 200);
  assert.deepEqual(h.effective().products[0].categorySubs, { work: ["מכנסיים"], winter: [outerwear], gear: ["כפפות"] });
  assert.equal((await h.post({ operation: "undo", id })).status, 409);
  assert.equal((await h.post({ operation: "undo", id: nextId })).status, 200);
  assert.deepEqual(h.store.categoryAdjustments, initial);
});

test("a direct main-category membership survives removal of its last subcategory", async () => {
  const h = harness();
  assert.equal((await h.post({ ...move, source: path("work", "מכנסיים"), products: ["one"] })).status, 200);
  assert.equal((await h.post({ ...move, id: nextId, products: ["one"] })).status, 200);
  assert.deepEqual(h.effective().products[0].categorySubs, { work: [], winter: [outerwear], gear: ["כפפות"] });
});

test("the merged category preserves old individual removals and supports moving and undoing the entire merged membership", async () => {
  const previous = { added: [], removed: [path("winter", coats)] };
  const h = harness({ categoryAdjustments: { [first]: previous } });
  assert.deepEqual(h.effective().products[0].categorySubs.winter, [outerwear]);
  assert.equal((await h.post({ ...move, source: path("winter", outerwear), products: ["one"] })).status, 200);
  assert.deepEqual(h.effective().products[0].categorySubs, { work: ["חולצות", "מכנסיים"], gear: ["כפפות"] });
  assert.equal((await h.post({ operation: "undo", id })).status, 200);
  assert.deepEqual(h.store.categoryAdjustments[first], previous);
  assert.deepEqual(h.effective().products[0].categorySubs.winter, [outerwear]);
});

test("unavailable products, invalid targets, and unauthorized requests cannot partially save a bulk move", async () => {
  const h = harness();
  assert.equal((await h.post({ ...move, products: ["one", "missing"] })).status, 409);
  assert.equal((await h.post({ ...move, target: path("unknown") })).status, 409);
  assert.equal((await h.post(move, "https://other.example.com")).status, 403);
  h.signOut();
  assert.deepEqual(await (await h.get()).json(), { enabled: false });
  assert.equal((await h.post(move)).status, 401);
  assert.deepEqual(h.store, {});
});

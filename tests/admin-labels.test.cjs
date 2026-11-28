const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const ts = require("typescript");

function load(file, dependencies = {}) {
  const js = ts.transpileModule(readFileSync(resolve(__dirname, "..", file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const out = {};
  new Function("require", "exports", js)(id => dependencies[id] ?? (id.startsWith("node:") ? require(id) : {}), out);
  return out;
}

const placement = load("lib/category-placement.ts");
const catalog = load("lib/catalog.ts", { "./category-placement": placement });
const labels = load("lib/admin/labels.ts", { "../catalog": catalog });
const models = load("lib/admin/models.ts");
const { applyAdminProducts } = load("lib/admin/commerce.ts", { "./models": models, "./labels": labels });

test("create, edit and remove scoped labels alongside a legacy product label", async () => {
  const store = { labels: [{ id: "old", productId: "shirt", text: "יחיד" }], offers: [], hiddenQuantityOffers: [],
    categoryPlacements: [{ collectionId: "custom", parentId: "pro", label: "תת חדשה" }] };
  const errors = class extends Error {};
  const { saveAdmin } = load("lib/admin/commands.ts", {
    "@/lib/catalog": catalog, "@/lib/category-placement": placement, "./labels": labels,
    "@/lib/admin/storage": { changeAdminStore: callback => callback(store), AdminEditBusy: errors,
      upsert: (list, item) => { const index = list.findIndex(row => row.id === item.id); if (index < 0) list.push(item); else list[index] = item; } },
    "@/lib/admin/hero-images": { InvalidHeroImage: errors },
    "@/lib/shopify/load-catalog": { loadShopCatalog: async () => ({ products: [{ id: "shirt" }] }) },
  });
  function command(fields, paths = []) {
    const form = new FormData();
    for (const [key, value] of Object.entries({ section: "labels", operation: "save", ...fields })) form.set(key, value);
    for (const [id, sub] of paths) { form.append("parentId", id); form.append("sub", sub); }
    return saveAdmin(form);
  }
  assert.ok((await command({ scope: "all", label: "כללי" })).ok);
  assert.ok((await command({ scope: "categories", label: "קטגוריה" }, [["winter", ""], ["shoes", ""]])).ok);
  assert.ok((await command({ scope: "categories", label: "תת" }, [["pro", "חולצות"], ["pro", "תת חדשה"]])).ok);
  const product = { cat: "winter", cats: ["winter", "pro"], categorySubs: { pro: ["תת חדשה"] } };
  const read = () => applyAdminProducts([{ ...product, id: "shirt" }, { ...product, id: "new" },
    { id: "coat", cat: "winter", sub: "חולצות" }, { id: "glove", cat: "safety" }], store).map(p => p.promoLabel);
  assert.deepEqual(read(), ["יחיד", "תת", "קטגוריה", "כללי"]);
  for (const [fields, paths] of [
    [{ scope: "all" }], [{ productId: "shirt" }], [{ productId: "missing" }], [{ scope: "other" }],
    [{ scope: "categories" }, [["pro", "חולצות"]]], [{ scope: "categories" }, [["safety", "תת חדשה"]]],
    [{ scope: "categories" }, [["unknown", ""]]], [{ scope: "categories" }, []],
  ]) assert.equal((await command({ ...fields, label: "כפול" }, paths)).ok, false);
  assert.equal(store.labels.length, 4);
  assert.ok((await command({ id: "old", scope: "categories", label: "בטיחות" }, [["safety", ""]])).ok);
  assert.deepEqual(read(), ["תת", "תת", "קטגוריה", "בטיחות"]);
  assert.ok((await command({ operation: "delete", id: "old" })).ok);
  assert.deepEqual(read(), ["תת", "תת", "קטגוריה", "כללי"]);
});

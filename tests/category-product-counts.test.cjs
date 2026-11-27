const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

function load(file, dependencies, jsx) {
  const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx,
  } }).outputText;
  const exports = {};
  new Function("require", "exports", js)(name => dependencies[name] ?? require(name), exports);
  return exports;
}

test("counts unique products across overlapping collections and keeps explicit supplier assignments", async () => {
  const shoePath = (sub = "") => ({ parentId: "shoes", sub });
  const options = [
    { id: "root", paths: [shoePath()] },
    { id: "safety1", paths: [shoePath("בטיחות")] },
    { id: "safety2", paths: [shoePath("בטיחות")] },
    { id: "outdoors", paths: [shoePath("טיולים")] },
    { id: "marketing", paths: [] },
  ];
  const product = (id, status = "ACTIVE", handle = id) => ({ id, status, handle });
  const page = (nodes, endCursor = null) => ({ nodes, pageInfo: { hasNextPage: !!endCursor, endCursor } });
  const first = {
    root: page([product("a"), product("archived", "ARCHIVED"), product("bundle", "ACTIVE", "ahim-bundle-" + "a".repeat(24))]),
    safety1: page([product("a")], "safety-next"),
    safety2: page([product("a"), product("b")]),
    outdoors: page([]),
  };
  const supplier1 = Array.from({ length: 200 }, (_, i) => ({
    supplier: "worker", source_id: String(i), collection_ids: [i === 0 ? "outdoors" : "marketing"],
  }));
  const { readCategoryProductCounts } = load("lib/admin/category-product-counts.ts", {
    "server-only": {},
    "@/lib/shopify/admin-bundles": {
      adminGraphQL: async (query, variables) => {
        if (query.includes("MembershipsPage")) {
          assert.deepEqual(variables, { id: "safety1", after: "safety-next" });
          return { collection: { id: "safety1", products: page([product("b")]) } };
        }
        assert.deepEqual(variables.ids, ["root", "safety1", "safety2", "outdoors"]);
        return { nodes: variables.ids.map(id => ({ id, products: first[id] })) };
      },
    },
    "@/lib/suppliers/storefront-collections": { supplierStorefrontCollections: async () => options },
    "@/lib/suppliers/storage": {
      shopFilter: () => ({ shop_domain: "eq.demo" }),
      supplierRequest: async (table, method, query) => {
        assert.equal(table, "ahim_supplier_previews");
        assert.equal(method, "GET");
        assert.equal(query.shop_domain, "eq.demo");
        assert.equal(query.shopify_product_id, "is.null");
        assert.equal(query.collection_ids, "not.eq.{}");
        if (query.offset === "0") return supplier1;
        assert.equal(query.offset, "200");
        return [{ supplier: "redback", source_id: "0", collection_ids: ["outdoors", "root"] }];
      },
    },
  });
  assert.deepEqual(await readCategoryProductCounts(), { shoes: { total: 4, subs: { בטיחות: 2, טיולים: 2 } } });
});

test("category cards show counts beside the names, including zero for an empty subcategory", () => {
  const icon = () => null;
  const { StorefrontCategoryCreator } = load("components/StorefrontCategoryCreator.tsx", {
    "next/navigation": { useRouter: () => ({ refresh() {} }) },
    "./icons": { IconCheck: icon, IconGrid: icon, IconPlus: icon },
  }, ts.JsxEmit.ReactJSX);
  const markup = renderToStaticMarkup(React.createElement(StorefrontCategoryCreator, {
    showTree: true,
    categories: [{ id: "shoes", name: "נעליים", subs: ["סניקרס ונעלי טיולים", "נעלי בטיחות"] }],
    counts: { shoes: { total: 197, subs: { "סניקרס ונעלי טיולים": 22 } } },
  }));
  assert.match(markup, /נעליים<\/bdi><bdi[^>]+>197<\/bdi>/);
  assert.match(markup, /סניקרס ונעלי טיולים<\/bdi><bdi[^>]+>22<\/bdi>/);
  assert.match(markup, /נעלי בטיחות<\/bdi><bdi[^>]+>0<\/bdi>/);
});

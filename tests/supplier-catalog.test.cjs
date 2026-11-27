const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
function moduleFor(name, deps = {}) {
  const source = fs.readFileSync(path.join(__dirname, "../lib/suppliers/", name + ".ts"), "utf8");
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const out = {};
  new Function("require", "exports", js)((id) => deps[id] ?? require(id), out);
  return out;
}
const categoryPlacement = moduleFor("../category-placement");
const categoryMatching = moduleFor("category-matching", { "@/lib/category-placement": categoryPlacement });
const { outdoorFootwear } = categoryPlacement;
const categoryAuditStub = { categoryOpportunityMinimum: 15, readSupplierCategoryAudit: async () => [] };
const supplierBrand = moduleFor("brand", { "@/lib/brands": moduleFor("../brands") });
const testBrandSettings = { readSupplierDefaultBrand: async domain => supplierBrand.supplierDefaultBrand(domain) };
const { pricedProduct, descendants, mappedCollections, formatMonitorCountdown } = moduleFor("catalog-model");
test("the supplier monitor countdown displays hours, minutes and seconds", () => {
  assert.equal(formatMonitorCountdown(24 * 3600), "24:00:00");
  assert.equal(formatMonitorCountdown(3661), "01:01:01");
  assert.equal(formatMonitorCountdown(3599), "00:59:59");
  assert.equal(formatMonitorCountdown(0), "00:00:00");
});
test("supplier brand detection separates declared brands, likely brands and missing values", () => {
  const product = { id: "43467", domain: "redback.co.il", brand: "", category: "ביגוד · מכנסיים", categoryIds: ["46"],
    title: "Angler Strech pants", description: [], attributes: [] };
  const detect = supplierBrand.detectSupplierBrand;
  assert.deepEqual(detect(product), { name: "Redback", evidence: "supplier-default" });
  assert.deepEqual(detect({ ...product, brand: "Viking" }), { name: "Viking", evidence: "source" });
  assert.deepEqual(detect({ ...product, title: "SHOWA Work Gloves", categoryIds: [] }), { name: "SHOWA", evidence: "title" });
  assert.deepEqual(detect({ ...product, brand: "worker.co.il", domain: "worker.co.il" }), { name: "", evidence: "missing" });
  assert.deepEqual(detect({ ...product, categoryIds: [], attributes: [{ name: "pa_manufacturer", values: ["Showa"] }] }), { name: "SHOWA", evidence: "source" });
  assert.deepEqual(detect({ ...product, domain: "another.example", description: ["Compatible with Redback boots"] }), { name: "", evidence: "missing" });
  assert.deepEqual(detect({ ...product, title: "LUCKY BAY T-SHIRT", category: "REDBACK OUTLET · ביגוד · חולצות" }),
    { name: "Redback", evidence: "supplier-default" });
  assert.deepEqual(detect({ ...product, title: "כפפות | SHOWA" }), { name: "SHOWA", evidence: "title" });
  assert.deepEqual(detect({ ...product, brandCandidates: ["Redback", "SHOWA"] }), { name: "", evidence: "missing" });
  assert.deepEqual(detect(product, ""), { name: "", evidence: "missing" });
});

test("a supplier can set or clear the brand fallback without changing other suppliers", async () => {
  const store = { supplierDefaultBrands: { "other.example": "Other Brand" } };
  const settings = moduleFor("brand-settings", {
    "server-only": {}, "./brand": supplierBrand,
    "@/lib/admin/storage": { readAdminStore: async () => store, changeAdminStore: async change => change(store) },
  });
  assert.equal(await settings.readSupplierDefaultBrand("www.redback.co.il"), "Redback");
  assert.equal(await settings.saveSupplierDefaultBrand("www.redback.co.il", ""), "");
  assert.equal(await settings.readSupplierDefaultBrand("redback.co.il"), "");
  assert.equal(await settings.saveSupplierDefaultBrand("redback.co.il", " redback "), "Redback");
  assert.equal(await settings.readSupplierDefaultBrand("other.example"), "Other Brand");
  await assert.rejects(settings.saveSupplierDefaultBrand("redback.co.il", "https://redback.co.il"), /שם מותג תקין/);
});

test("a product category choice validates the storefront path, and a publish retry resumes from the linked product", async () => {
  const model = moduleFor("catalog-model");
  const site = { domain: "example.com", percent: 10, issues: [] };
  const draftId = "gid://shopify/Product/81";
  const snapshot = { title: "SHOWA gloves", id: "52", variants: [{ price: 100, regular: 100 }] };
  const row = { scan_error: null, source_id: "52", revision: "a".repeat(64), snapshot, shopify_product_id: null,
    manual_price: null, collection_ids: [], category_ids: [] };
  const records = [];
  const storage = {
    getPreview: async (_, id) => id === "52" ? { ...row } : undefined,
    saveProductCategory: async (preview, ids) => {
      records.push(["save", preview.source_id, ids]);
      row.collection_ids = ids;
    },
  };
  const assignment = moduleFor("category-assignment", {
    "server-only": {}, "next/cache": {}, "@/lib/category-placement": categoryPlacement,
    "./catalog-model": model, "./storage": storage, "./shopify": {},
  });
  const { POST } = moduleFor("../../app/admin/suppliers/route", {
    "@/lib/admin/access": { isAdmin: async () => true }, "@/lib/admin/request-origin": { adminRequestOrigin: () => true },
    "@/lib/suppliers/storage": storage, "@/lib/suppliers/shopify-source": {},
    "@/lib/suppliers/cloud-worker": {}, "@/lib/suppliers/sites": { getSite: async () => site },
    "@/lib/suppliers/shopify": { importDraft: async (preview, collections, approved) => {
      assert.equal(preview.shopify_product_id, null);
      records.push(["import", collections, approved.brand, approved.variants[0].price]);
      row.shopify_product_id = draftId;
      return { id: draftId };
    } },
    "@/lib/suppliers/catalog-model": model, "@/lib/suppliers/catalog-batch": {},
    "@/lib/suppliers/public-source": { normalizeDomain: domain => domain }, "@/lib/suppliers/woocommerce": {},
    "@/lib/suppliers/import-queue": {}, "@/lib/suppliers/monitor-report": {}, "next/server": {},
    "@/lib/suppliers/publication": { refreshLinkedProduct: async (linked, publish) => {
      records.push(["verifyAndPublish", linked.shopify_product_id, publish]);
      return { live: true };
    } },
    "next/cache": { revalidateTag: () => {} }, "@/lib/suppliers/category-approval": {
      createStorefrontCategory: async form => ({ id: "camping", parentId: form.get("parent"), parent: "אביזרים", sub: form.get("label") }),
    }, "@/lib/suppliers/brand": supplierBrand,
    "@/lib/suppliers/brand-settings": testBrandSettings,
    "@/lib/suppliers/located-catalog": {},
    "@/lib/suppliers/category-assignment": assignment,
    "@/lib/suppliers/storefront-collections": { supplierStorefrontCollections: async () => [
      { id: "my-category", manual: true, published: true, paths: [{ parent: "אביזרים", sub: "" }] },
      { id: "camping", manual: true, published: true, paths: [{ parent: "אביזרים", sub: "ציוד לקמפינג" }] },
      { id: "unplaced", manual: true, published: true, paths: [] },
    ] },
  });
  const categoryRequest = collection => {
    const body = new FormData();
    for (const [name, value] of Object.entries({
      action: "product-category", domain: site.domain, id: "52", revision: row.revision, collection,
    })) body.set(name, value);
    return new Request("https://www.example.com/admin/suppliers", { method: "POST", body });
  };
  assert.equal((await POST(categoryRequest("unplaced"))).status, 422);
  assert.equal((await POST(categoryRequest("my-category"))).status, 200);
  const bulk = new FormData();
  bulk.set("action", "create-category");
  bulk.set("domain", site.domain);
  bulk.set("label", "ציוד לקמפינג");
  bulk.set("parent", "acc");
  bulk.append("item", "52:" + row.revision);
  bulk.append("item", "53:" + row.revision);
  const bulkReply = await POST(new Request("https://www.example.com/admin/suppliers", { method: "POST", body: bulk }));
  assert.deepEqual(await bulkReply.json(), {
    category: { id: "camping", parentId: "acc", parent: "אביזרים", sub: "ציוד לקמפינג" }, assigned: ["52"], failed: ["53"],
    current: { "52": ["אביזרים", "אביזרים / ציוד לקמפינג"] },
  });
  const request = () => {
    const body = new FormData();
    for (const [name, value] of Object.entries({ action: "publish", domain: site.domain, id: "52", revision: row.revision, brand: "Approved" })) body.set(name, value);
    body.append("collection", "my-category");
    body.append("collection", "my-category");
    return new Request("https://www.example.com/admin/suppliers", { method: "POST", body });
  };
  assert.match((await (await POST(request())).json()).message, /המוצר פורסם באתר/);
  assert.equal((await POST(request())).status, 200);
  assert.deepEqual(records, [["save", "52", ["my-category"]], ["save", "52", ["camping", "my-category"]], ["import", ["my-category"], "Approved", 110],
    ["verifyAndPublish", draftId, true], ["verifyAndPublish", draftId, true]]);
});

test("category replacement verifies the new Shopify membership first and preserves other collections", async () => {
  const scope = (id, manual, paths = []) => ({ id, manual, published: true, paths });
  const options = [scope("new", true, [{ parent: "אביזרים", sub: "כובעים" }]),
    scope("old", true, [{ parent: "ביגוד", sub: "חולצות" }]), scope("marketing", true),
    scope("smart", false, [{ parent: "מבצעים", sub: "" }])];
  const revisions = new Map([["1", "r"], ["2", "r"]]);
  const events = [];
  const row = { source_id: "1", revision: "r", shopify_product_id: "linked", collection_ids: ["old", "marketing"] };
  const memberships = new Set(["old", "marketing", "smart"]);
  let addFailure = true;
  const { assignSupplierCategories } = moduleFor("category-assignment", {
    "server-only": {}, "next/cache": { revalidateTag: tag => events.push(["invalidate", tag]) },
    "@/lib/category-placement": categoryPlacement, "./catalog-model": moduleFor("catalog-model"),
    "./storage": {
      getPreview: async (_, id) => id === "1" ? row : { source_id: id, revision: "stale" },
      withLinkedProductLock: async (_, work) => work(),
      saveLinkedProductCategories: async (_, tracked) => events.push(["save", tracked]),
    },
    "./shopify": {
      supplierCollectionMemberships: async () => new Map([["linked", [...memberships]]]),
      addSupplierCollectionMembership: async (_, id) => {
        if (addFailure) throw new Error("add failed");
        events.push(["add", id]); memberships.add(id);
      },
      removeSupplierCollectionMembership: async (_, id) => {
        assert.ok(memberships.has("new")); events.push(["remove", id]); memberships.delete(id);
      },
      markSupplierCategoryReviewed: async (_, id) => events.push(["reviewed", id]),
    },
  });
  const site = { domain: "example.com" };
  const failed = await assignSupplierCategories(site, revisions, "new", "replace", options);
  assert.equal(failed.failed.length, 2);
  assert.equal(failed.failed[0].message, "add failed");
  assert.deepEqual([...memberships], ["old", "marketing", "smart"]);
  addFailure = false;
  const added = await assignSupplierCategories(site, new Map([["1", "r"]]), "new", "add", options);
  assert.deepEqual(added.assigned[0].current, ["אביזרים / כובעים", "ביגוד / חולצות", "מבצעים"]);
  assert.ok(memberships.has("old"));
  const replaced = await assignSupplierCategories(site, revisions, "new", "replace", options);
  assert.deepEqual(replaced.assigned, [{ id: "1", current: ["אביזרים / כובעים", "מבצעים"] }]);
  assert.deepEqual([...memberships], ["marketing", "smart", "new"]);
  assert.deepEqual(events.slice(-4), [["save", ["new", "marketing"]], ["remove", "old"], ["reviewed", "new"], ["invalidate", "shop-catalog"]]);
});
test("site percentage and manual pricing use the original price, not the supplier sale", () => {
  const p = {
    variants: [
      { price: 100, regular: 120 },
      { price: 89.95, regular: 99 },
    ],
  };
  assert.deepEqual(pricedProduct(p, 10, null).variants, [
    { price: 132, regular: 132 },
    { price: 108.9, regular: 108.9 },
  ]);
  assert.equal(pricedProduct(p, -10, null).variants[0].price, 108);
  assert.deepEqual(pricedProduct(p, 10, 105).variants, [
    { price: 105, regular: 105 },
    { price: 105, regular: 105 },
  ]);
  assert.equal(p.variants[0].price, 100);
  assert.throws(() => pricedProduct({ ...p, currency: "EUR" }, 0, null));
  assert.equal(pricedProduct({ ...p, currency: "EUR" }, 0, 100).variants[0].price, 100);
});
test("category selection expands descendants and inherits the nearest approved mapping", () => {
  const categories = [
    { id: "1", parent: "0" },
    { id: "2", parent: "1" },
    { id: "3", parent: "2" },
    { id: "4", parent: "0" },
  ];
  const site = { categories, mappings: { 1: ["all"], 2: ["boots"], 4: ["sale"] } };
  assert.deepEqual(descendants(["2"], categories), ["2", "3"]);
  assert.deepEqual(mappedCollections(["3", "4"], site), ["boots", "sale"]);
});
test("category review distinguishes inherited mappings, proposed groups and verified Shopify changes", async () => {
  const catalog = { CATS: [{ id: "shoes", name: "נעלי עבודה ובטיחות", subs: ["נעלי בטיחות", "מגפי עבודה ובטיחות"] },
    { id: "acc", name: "אביזרים", subs: ["אביזרים למטבח"] }] };
  const site = {
    domain: "example.com", pull_started_at: "2026-11-26T10:00:00Z",
    categories: [
      { id: "1", name: "נעלי עבודה ובטיחות", parent: "0" },
      { id: "2", name: "מגני קרסול", parent: "1" },
      { id: "3", name: "נעלי בטיחות קיץ", parent: "0" },
      { id: "4", name: "מגפי עבודה", parent: "0" },
      { id: "5", name: "אביזרי שריכה", parent: "0" },
      { id: "6", name: "נעלי ריצה כביש Up to 50%off", parent: "0" },
      { id: "7", name: "sibling-c-101", parent: "0" },
      { id: "8", name: "נעלי עבודה עם מגן", parent: "0" },
      { id: "9", name: "סניקרס ונעלי טיולים", parent: "0" },
    ],
    mappings: { "1": ["shoes"], "4": ["boots"], "9": ["safety"] },
  };
  const collections = [["shoes", "נעלי עבודה ובטיחות", ""], ["safety", "נעלי בטיחות", "נעלי בטיחות"],
    ["safety-copy", "נעל בטיחות", "נעלי בטיחות"], ["boots", "מגפי עבודה ובטיחות", "מגפי עבודה ובטיחות"],
    ["laces", "אביזרי שריכה", null]].map(([id,title,sub]) => ({ id, title, manual: true, published: true,
      paths: sub === null ? [] : [{ parentId: "shoes", parent: "נעלי עבודה ובטיחות", sub }] }));
  collections.push({ id: "kitchen", title: "אביזרים למטבח", manual: true, published: true,
    paths: [{ parentId: "acc", parent: "אביזרים", sub: "אביזרים למטבח" }] });
  const row = (source_id, title, category, shopify_product_id = null) => ({
    source_id, title, category_ids: [category], shopify_product_id, productType: null, brand: null, description: null,
  });
  const rows = [
    row("1", "מגן קרסול אלסטי", "2"), row("2", "מגן קרסול מבד", "2"),
    row("3", "נעל בטיחות מאווררת", "3"), row("4", "נעל בטיחות עם כיפה", "4", "linked-a"),
    row("5", "מגף עבודה אטום", "4", "linked-b"), row("6", "אביזרי שריכה - שרוכים עגולים", "5"),
    row("7", "נעלי ריצה כביש דגם קל", "6"), row("8", "טישירט בסיסי", "7"), row("9", "נעל בטיחות קלה", "8"),
    { ...row("10", "ערכת קפה טקטית", "7"), image: "https://example.com/coffee.jpg", revision: "coffee-revision", collection_ids: [] },
    { ...row("11", "ערכת קפה טקטית גדולה", "7"), collection_ids: ["kitchen"] },
    row("12", "נעל בטיחות עם מגן", "4", "linked-reviewed"),
    { ...row("13", "נעלי טיולים Vidden Hybrid לנשים", "9"), collection_ids: ["safety"] },
  ];
  const review = moduleFor("category-review", {
    "server-only": {}, "@/lib/catalog": catalog, "./catalog-model": moduleFor("catalog-model"),
    "@/lib/category-placement": categoryPlacement, "./category-matching": categoryMatching,
    "./category-audit": categoryAuditStub,
    "./storefront-collections": { supplierStorefrontCollections: async () => collections },
    "./shopify": {
      supplierCollectionMemberships: async (ids, reviewed) => {
        assert.deepEqual(ids, ["linked-a", "linked-b", "linked-reviewed"]);
        reviewed.set("linked-reviewed", "boots");
        return new Map([["linked-a", ["boots"]], ["linked-b", ["boots"]], ["linked-reviewed", ["boots"]]]);
      },
    },
    "./storage": {
      shopFilter: () => ({ shop_domain: "eq.test" }),
      supplierRequest: async (_, method, params) => {
        assert.equal(method, "GET");
        assert.equal(params.scanned_at, "gte." + site.pull_started_at);
        assert.equal(params.review_state, "in.(known,pending)");
        return rows;
      },
    },
  });
  const suggestions = [...(await review.readCategoryReview(site)).values()];
  assert.deepEqual(suggestions.map(group => [group.kind, group.products.map(product => product.id)]), [
    ["new", ["1", "2"]], ["existing", ["3", "9"]], ["change", ["4"]], ["place", ["6"]], ["new", ["7"]], ["review", ["8", "10"]], ["new", ["13"]],
  ]);
  assert.equal(suggestions[0].parent, "נעלי עבודה ובטיחות");
  assert.equal(suggestions[2].title, "נעלי בטיחות");
  assert.deepEqual(suggestions[2].products[0].current, ["נעלי עבודה ובטיחות / מגפי עבודה ובטיחות"]);
  assert.equal(suggestions[2].products[0].recommendation.id, "safety");
  assert.equal(suggestions[1].products[0].proposedCategory, "נעלי עבודה ובטיחות / נעלי בטיחות");
  assert.equal(suggestions[4].products[0].proposedCategory, "נעלי עבודה ובטיחות / נעלי ריצה כביש");
  assert.equal(suggestions[4].title, "נעלי ריצה כביש");
  assert.equal(suggestions[4].parent, "נעלי עבודה ובטיחות");
  assert.equal(suggestions[4].source.name, "נעלי ריצה כביש Up to 50%off");
  assert.deepEqual(suggestions[1].sources.map(source => source.id), ["3", "8"]);
  assert.deepEqual(suggestions[5].sources, []);
  assert.equal(suggestions[5].products[0].recommendation, undefined);
  assert.equal(suggestions[5].products[1].image, "https://example.com/coffee.jpg");
  assert.equal(suggestions[5].products[1].revision, "coffee-revision");
  assert.deepEqual(suggestions[5].products[1].recommendation, { id: "kitchen", parentId: "acc", parent: "אביזרים", sub: "אביזרים למטבח" });
  assert.deepEqual(review.storefrontCategoryChoices(collections).map(choice => choice.id).sort(), ["boots", "kitchen", "safety", "shoes"]);
  assert.deepEqual(review.suggestedProductCategoryIds(rows[2], ["3"], site, collections), ["safety"]);
  assert.equal(suggestions[6].parent, outdoorFootwear.parent);
  assert.equal(suggestions[6].title, outdoorFootwear.sub);
  assert.deepEqual(review.suggestedProductCategoryIds(rows.at(-1), ["9"], site, collections), []);
  assert.deepEqual(review.suggestedProductCategoryIds(rows.at(-1), ["9"], site, [...collections, {
    id: "outdoor", title: outdoorFootwear.sub, manual: true, published: true,
    paths: [{ parentId: outdoorFootwear.id, parent: outdoorFootwear.parent, sub: outdoorFootwear.sub }],
  }]), ["outdoor"]);
  assert.equal(categoryPlacement.categoryFilterLabel("מוצר כותנה 100%"), "מוצר כותנה 100%");
  assert.equal(categoryMatching.supplierCategoryLabel("sibling-c-1417"), "");
  assert.equal(categoryMatching.supplierCategoryLabel("כל מוצרי האתר - לא לגעת להנחות"), "");
  assert.equal(categoryMatching.canonicalCategoryLabel("נעליים והנעלה"), "נעלי עבודה ובטיחות");
});

test("category audits count distinct products with matching evidence and exclude apparel and protected footwear", () => {
  const audit = moduleFor("category-audit", {
    "server-only": {}, "next/cache": { unstable_cache: fn => fn },
    "@/lib/catalog": { CATS: [{ id: "acc", name: "אביזרים", subs: [] },
      { id: "winter", name: "ביגוד חורף", subs: ["חולצות ארוכות"] }] },
    "@/lib/shopify/config": {}, "./catalog-model": moduleFor("catalog-model"),
    "./category-matching": categoryMatching, "./storage": {},
  });
  const products = Array.from({ length: 15 }, (_, i) => ({
    source_id: String(i), title: "ערסל טיולים " + i, category: "אביזרים · ערסלים",
  }));
  assert.deepEqual(audit.categoryOpportunities([...products.slice(1), products[1]]), []);
  const [opportunity] = audit.categoryOpportunities([...products, { source_id: "extra", title: "ערכה לתיקון", category: "ערסלים" }]);
  assert.equal(opportunity.label, "ערסלים");
  assert.equal(opportunity.ids.length, 15);
  assert.deepEqual(audit.categoryOpportunities(products.map(product => ({
    ...product, title: "טישירט שרוול ארוך " + product.source_id, category: "טישירט שרוול ארוך",
  }))), []);
  assert.equal(categoryMatching.isOutdoorFootwear({ title: "נעלי טיולים Vidden Hybrid לנשים" }), true);
  assert.equal(categoryMatching.isOutdoorFootwear({ title: "מגפי טיולים Cascade עם אטימות למים" }), true);
  assert.equal(categoryMatching.isOutdoorFootwear({ title: "מארז גרבי סניקרס" }), false);
  assert.equal(categoryMatching.isOutdoorFootwear({ title: "סניקרס משולבות", attributes: [{ name: "תקן", values: ["S3"] }] }), false);
  assert.equal(categoryMatching.isOutdoorFootwear({ title: "כפכפי HH לגברים" }), false);
});

test("bulk imports wait for the outdoor footwear path and preserve the work footwear route", async () => {
  const model = moduleFor("catalog-model");
  const rows = [
    { source_id: "1", title: "נעלי טיולים Vidden Hybrid לנשים", category_ids: ["1"], collection_ids: [], revision: "r" },
    { source_id: "2", title: "סניקרס בטיחות S3", category_ids: ["1"], collection_ids: [], revision: "r" },
  ];
  let options = [];
  const submitted = [];
  const api = moduleFor("import-queue", {
    "server-only": {}, "@/lib/shopify/config": { shopDomain: () => "shop" }, "./catalog-model": model,
    "./category-matching": categoryMatching, "./brand": supplierBrand, "./shopify": {},
    "./storefront-collections": { supplierStorefrontCollections: async () => options },
    "./storage": {
      shopFilter: () => ({}), supplierRequest: async (table, method, _, values) => {
        if (table === "ahim_supplier_previews") return rows;
        if (method === "POST") { submitted.push(...values); return values; }
        return [];
      },
    },
  });
  const site = { domain: "example.com", mappings: { "1": ["work"] }, categories: [{ id: "1", parent: "0" }] };
  const waiting = await api.queueImports(site, ["1", "2"]);
  assert.deepEqual(submitted.map(task => [task.source_id, task.collection_ids]), [["2", ["work"]]]);
  assert.match(waiting.skipped[0], /סניקרס ונעלי טיולים/);
  submitted.length = 0;
  options = [{ id: "outdoor", manual: true, published: true,
    paths: [{ parentId: outdoorFootwear.id, parent: outdoorFootwear.parent, sub: outdoorFootwear.sub }] }];
  await api.queueImports(site, ["1", "2"]);
  assert.deepEqual(submitted.map(task => [task.source_id, task.collection_ids]), [["1", ["outdoor"]], ["2", ["work"]]]);
});
test("explicit category approval registers and publishes a collection once across retries", async () => {
  const parent = { id: "shoes", name: "נעלי עבודה ובטיחות", subs: [] };
  const state = { categoryPlacements: [] };
  const site = { domain: "example.com", state: "complete", pull_started_at: "2026-11-26T10:00:00Z", categories: [{ id: "19" }] };
  const collection = { id: "gid://shopify/Collection/42", ruleSet: null, onSite: false };
  const calls = [];
  let created = false;
  const { approveSupplierCategory } = moduleFor("category-approval", {
    "server-only": {}, "@/lib/catalog": { CATS: [parent] }, "next/cache": { revalidateTag: tag => calls.push(tag) },
    "@/lib/category-placement": categoryPlacement,
    "@/lib/shopify/fetch-catalog": { menuPlacements: () => new Map() },
    "@/lib/admin/storage": { changeAdminStore: async edit => edit(state) }, "./publication": { sitePublication: () => "storefront" },
    "./shopify": { supplierCollections: async () => created ? [collection] : [] },
    "./sites": { getSite: async () => site, addCategoryMapping: async (...args) => { calls.push(args.slice(1)); } },
    "@/lib/shopify/admin-bundles": { adminGraphQL: async (query, variables) => {
      if (query.includes("ApprovedCategory($handle")) return { collectionByIdentifier: created ? collection : null };
      if (query.includes("CreateApprovedCategory")) {
        assert.equal(variables.collection.title, "נעלי ריצה כביש");
        assert.match(variables.collection.handle, /^ahim-category-[a-f0-9]+$/);
        created = true;
        calls.push("create");
        return { collectionCreate: { collection, userErrors: [] } };
      }
      assert.match(query, /PublishApprovedCollection/);
      calls.push("publish");
      collection.onSite = true;
      return { publishablePublish: { publishable: { onSite: true }, userErrors: [] } };
    } },
  });
  const form = new FormData();
  for (const [key, value] of Object.entries({ category: "19", label: "נעלי ריצה כביש", parent: "shoes", run: site.pull_started_at })) {
    form.set(key, value);
  }
  await assert.rejects(approveSupplierCategory({ ...site, pull_started_at: "stale" }, form), /השתנו/);
  assert.equal((await approveSupplierCategory(site, form)).mapped, true);
  assert.equal((await approveSupplierCategory(site, form)).mapped, true);
  assert.deepEqual(state.categoryPlacements, [{ collectionId: collection.id, parentId: "shoes", label: "נעלי ריצה כביש" }]);
  assert.deepEqual(calls, ["create", "publish", "shop-catalog", ["19", collection.id, site.pull_started_at], "shop-catalog", ["19", collection.id, site.pull_started_at]]);
});

test("storefront categories can be created independently, reused and nested under a new root", async () => {
  const state = { categoryPlacements: [] };
  const collections = new Map();
  const { createStorefrontCategory } = moduleFor("category-approval", {
    "server-only": {}, "@/lib/catalog": { CATS: [{ id: "acc", name: "אביזרים", subs: [] }] },
    "@/lib/category-placement": categoryPlacement,
    "@/lib/admin/storage": { changeAdminStore: async edit => edit(state) },
    "next/cache": { revalidateTag: () => {} }, "./publication": { sitePublication: () => "storefront" }, "./sites": {},
    "./shopify": { supplierCollections: async () => [...collections.values()] },
    "@/lib/shopify/fetch-catalog": { menuPlacements: (items, placements) => new Map(items.map(item => [
      item.handle, placements.filter(path => path.collectionId === item.id).map(path => ({ parentId: path.parentId, sub: path.label })),
    ])) },
    "@/lib/shopify/admin-bundles": { adminGraphQL: async (query, variables) => {
      if (query.includes("ApprovedCategory($handle")) return { collectionByIdentifier: collections.get(variables.handle) ?? null };
      if (query.includes("CreateApprovedCategory")) {
        const collection = { ...variables.collection, id: String(collections.size), onSite: false, ruleSet: null };
        collections.set(collection.handle, collection);
        return { collectionCreate: { collection, userErrors: [] } };
      }
      const collection = [...collections.values()].find(item => item.id === variables.id);
      collection.onSite = true;
      return { publishablePublish: { publishable: { onSite: true }, userErrors: [] } };
    } },
  });
  const create = (label, parent = "") => {
    const form = new FormData();
    form.set("label", label);
    form.set("parent", parent);
    return createStorefrontCategory(form);
  };
  const camping = await create("ציוד לקמפינג", "acc");
  assert.deepEqual(camping, { id: "0", parentId: "acc", parent: "אביזרים", sub: "ציוד לקמפינג" });
  assert.deepEqual(await create(" ציוד  לקמפינג ", "acc"), camping);
  const root = await create("טיולים");
  const child = await create("טיולים", root.parentId);
  assert.equal(root.sub, "");
  assert.equal(child.parentId, root.parentId);
  assert.notEqual(child.id, root.id);
  assert.deepEqual(categoryPlacement.storefrontCategories([], state.categoryPlacements), [{ id: root.parentId, name: "טיולים", subs: ["טיולים"] }]);
  assert.equal(collections.size, 3);
  assert.ok([...collections.values()].every(collection => collection.onSite));
});
const siteBrands = moduleFor("../brands");
const { readWooProduct, catalogPage, wooThumbnail, wooReviewImages } = moduleFor("woocommerce", {
  "server-only": {}, "./public-source": {}, "./catalog-model": moduleFor("catalog-model"), "@/lib/brands": siteBrands,
});
test("pull estimates use measured first-page work and reserve 100% for completion", () => {
  const { pullProgress } = moduleFor("catalog-model");
  const run = { state: "running", pull_checked: 2, pull_total: 10, page_count: 1,
    pull_started_at: "2026-01-01T10:00:00Z", pull_sampled_at: "2026-01-01T10:00:06Z" };
  assert.deepEqual(pullProgress(run), { percent: 20, secondsLeft: 24 });
  assert.equal(pullProgress({ ...run, pull_checked: 1 }).secondsLeft, null);
  assert.deepEqual(pullProgress({ ...run, page_count: 0, pull_total: null }), { percent: null, secondsLeft: null });
  assert.equal(pullProgress({ ...run, page_count: 2, pull_total: null }).secondsLeft, 66);
  assert.equal(pullProgress({ ...run, pull_checked: 10 }).percent, 99);
  assert.equal(pullProgress({ ...run, state: "complete" }).percent, 100);
});
test("the source total follows the selected pages, with an unknown total until the final short page", async () => {
  const page = (n, length, headers) => catalogPage(async () => ({ data: Array(length), headers }), n);
  assert.equal((await page(1, 12, { "x-wp-total": "14", "x-wp-totalpages": "2" })).total, 14);
  assert.equal((await page(1, 12, {})).total, null);
  assert.equal((await page(2, 2, {})).total, 14);
  assert.equal((await page(1, 0, {})).total, 0);
});
test("a pull reports product progress inside page one and stops claiming work after removal", async () => {
  const model = moduleFor("catalog-model");
  const site = { domain: "example.com", state: "queued", removed_at: null, pull_all: true, cursor_page: 1,
    pull_checked: 0, pulled: 0, issues: [], selection: [], categories: [], attempts: 0,
    platform: "woo", phase: "catalog", pull_started_at: "2026-01-02T10:00:00Z", discovered_at: "2026-01-01T10:00:00Z" };
  const samples = [];
  const saved = [];
  const sites = moduleFor("sites", {
    "server-only": {}, "@/lib/shopify/config": {}, "./import-queue": { processNextImport: async () => {} },
    "./catalog-model": model, "./shopify-source": {}, "./public-source": { sourceReader: async () => ({}) },
    "./woocommerce": {
      discoverCategories: async () => [{ id: "1", name: "New category", parent: "0" }],
      catalogPage: async () => {
        assert.equal(site.categories[0].name, "New category");
        return { products: [{ id: 1 }, { id: 2 }, { id: 3 }], total: 3, pages: 1, more: false };
      },
      wooThumbnail,
      readWooProduct: async (_, domain, p) => p,
    },
    "./storage": {
      shopFilter: () => ({ shop_domain: "eq.test" }),
      supplierRequest: async (table, method, filters, body) => {
        assert.equal(table, "ahim_supplier_sites");
        assert.equal(filters.shop_domain, "eq.test");
        assert.equal(filters.removed_at, "is.null");
        if (site.removed_at || (filters.lease && filters.lease !== "eq." + site.lease)) return [];
        if (method === "PATCH") {
          assert.equal(filters.domain, "eq.example.com");
          Object.assign(site, body);
          if (body.pull_total) samples.push(body.pull_checked);
        }
        return [{ ...site }];
      },
      savePreview: async (product) => {
        saved.push(product.id);
        if (product.id === 2) await sites.removeSite(site.domain);
      },
    },
  });
  await sites.processCatalogJobs();
  await sites.processCatalogJobs();
  assert.deepEqual(samples, [0, 1]);
  assert.deepEqual(saved, [1, 2]);
  assert.deepEqual(await sites.listSites(), []);
  assert.equal(site.lease, null);
  assert.equal(site.state, "idle");
});
const domain = "example.com",
  sourceImage = "https://example.com/img.jpg";
test("review photos accept any public image host and skip addresses that are not public", async () => {
  const ids = ["42","43","44"];
  const cdn = "https://res.cloudinary.com/demo/image/upload/boot.jpg";
  const woo = await wooReviewImages(async path => {
    assert.equal(new URL(path,sourceImage).searchParams.get("include"),"42,43,44");
    return {data:[
      {id:43,images:[]}, {id:99,images:[{src:sourceImage}]},
      {id:42,type:"unsupported",images:[{thumbnail:"http://cdn.example/img.jpg",src:cdn}]},
      {id:44,images:[{src:"https://10.1.2.3/secret.jpg"}]},
    ]};
  },domain,ids);
  assert.deepEqual(woo,{"42":cdn});
  const {shopifyReviewImages} = moduleFor("shopify-source",{
    "server-only":{},"./public-source":{},"./catalog-model":moduleFor("catalog-model"),"@/lib/brands":siteBrands,
  });
  const shopify = await shopifyReviewImages(async (_,body) => {
    assert.deepEqual(body.variables.ids,ids.map(id=>"gid://shopify/Product/"+id));
    return {data:{data:{nodes:[null,
      {id:"gid://shopify/Product/42",featuredImage:{url:sourceImage}},
      {id:"gid://shopify/Product/43",featuredImage:{url:"https://other.example/img.jpg"}},
      {id:"gid://shopify/Product/44",featuredImage:{url:"https://user:pass@cdn.shopify.com/x.jpg"}},
    ]}}};
  },domain,ids);
  assert.deepEqual(shopify,{"42":sourceImage,"43":"https://other.example/img.jpg"});
});
test("Storefront indexing merges selected collections with durable cursor pagination", async () => {
  const {indexShopifyPage}=moduleFor("shopify-source",{
    "server-only":{},"./public-source":{},"./catalog-model":moduleFor("catalog-model"),"@/lib/brands":siteBrands,
  });
  const site={selection:["1","3"], categories:[{id:"1"},{id:"2"},{id:"3"}],index_group:0,index_page:1,source_index:{}};
  const requests=[];
  const read=async (_,body)=>{
    requests.push(body.variables);
    const more=requests.length===1;
    return {data:{data:{collection:{products:{nodes:[{id:"gid://shopify/Product/42",handle:"boot"}],
      pageInfo:{hasNextPage:more,endCursor:more?"cursor":null}}}}}};
  };
  Object.assign(site,await indexShopifyPage(read,site));
  Object.assign(site,await indexShopifyPage(read,site));
  Object.assign(site,await indexShopifyPage(read,site));
  assert.equal(site.phase,"catalog");
  assert.deepEqual(site.source_index,{"42":{handle:"boot",categories:["1","3"]}});
  assert.deepEqual(requests.map(r=>[r.id,r.after]),[
    ["gid://shopify/Collection/1",null],["gid://shopify/Collection/1","cursor"],["gid://shopify/Collection/3",null]]);
});
test("collection discovery and saving estimate their own remaining work", () => {
  const { indexCollectionProgress, pullProgress } = moduleFor("catalog-model");
  const started = "2026-11-27T15:00:00Z";
  const sampled = "2026-11-27T15:10:00Z";
  assert.deepEqual(indexCollectionProgress({ pull_all: true, index_group: 101, pull_started_at: started, pull_sampled_at: null },
    300, Date.parse(sampled)), { checked: 100, total: 300, secondsLeft: 1200 });
  assert.equal(indexCollectionProgress({ pull_all: true, index_group: 0, pull_started_at: started }, 300, Date.parse(sampled)), null);
  assert.deepEqual(pullProgress({ state: "running", pull_checked: 10, pull_total: 100, pull_started_at: started, pull_sampled_at: sampled },
    { checked: 2, sampledAt: Date.parse(sampled) - 16000 }), { percent: 10, secondsLeft: 180 });
});

test("located cards use only the active run and exclude products that already have a saved preview", async () => {
  const source_index = {
    "31": { title: "Worker jacket", handle: "worker-jacket", categories: ["8"], image: "https://example.com/item.jpg" },
    "32": { handle: "machine%20wash-pants", categories: ["8"] },
    "33": { title: "Shoes", handle: "shoes", categories: ["9"] },
  };
  const site = { domain: "example.com", state: "running", platform: "shopify", phase: "index", run_kind: "pull",
    pull_started_at: "2026-11-27T15:00:00Z", categories: [{ id: "8", parent: "0" }, { id: "9", parent: "0" }] };
  const now = { phase: "index", pull_checked: 0, source_index };
  const { readLocatedCatalogBatch } = moduleFor("located-catalog", {
    "server-only": {}, "./catalog-model": moduleFor("catalog-model"),
    "./storage": { shopFilter: () => ({}), supplierRequest: async (table, method, filters) => {
      assert.equal(table, "ahim_supplier_sites");
      assert.equal(filters.pull_started_at, "eq." + site.pull_started_at);
      return [now];
    }, previews: async (_, filters) => {
      assert.match(filters.source_id, /^in\.\(3[12](,32)?\)$/);
      return filters.source_id.includes("31") ? [{ source_id: "31" }] : [];
    } },
  });
  const expected = { items: [{ id: "32", title: "machine wash pants", image: undefined, categories: ["8"] }], more: false };
  assert.deepEqual(await readLocatedCatalogBatch(site, "8", 1), expected);
  now.phase = "catalog";
  now.pull_checked = 1;
  assert.deepEqual(await readLocatedCatalogBatch(site, "8", 1), expected);
  assert.deepEqual(await readLocatedCatalogBatch({ ...site, state: "complete" }, "8", 1), { items: [], more: false });
});
test("full Shopify pulls page through products without walking through every collection", async () => {
  const { indexShopifyPage } = moduleFor("shopify-source", { "server-only": {}, "./public-source": {}, "./catalog-model": moduleFor("catalog-model"), "@/lib/brands": siteBrands });
  const site = { pull_all: true, index_group: 0, index_page: 1, categories: Array.from({ length: 560 }, (_, i) => ({ id: String(i) })) };
  const requests = [];
  const read = async (_, { query, variables }) => {
    assert.match(query, /query All/);
    requests.push(variables.after);
    const more = requests.length === 1;
    return { data: { data: { products: { nodes: [{ id: "gid://shopify/Product/" + requests.length, handle: "product" }],
      pageInfo: { hasNextPage: more, endCursor: more ? "cursor" : null } } } } };
  };
  Object.assign(site, await indexShopifyPage(read, site));
  assert.equal(site.phase, "index");
  Object.assign(site, await indexShopifyPage(read, site));
  assert.equal(site.phase, "catalog");
  assert.deepEqual(requests, [null, "cursor"]);
  assert.deepEqual(Object.keys(site.source_index), ["1", "2"]);
});

test("a full pull already past product indexing starts saving products in the same worker call", async () => {
  const model = moduleFor("catalog-model");
  const source = moduleFor("shopify-source", { "server-only": {}, "./public-source": {}, "./catalog-model": moduleFor("catalog-model"), "@/lib/brands": siteBrands });
  const categories = [{ id: "1", name: "Shoes", parent: "0" }];
  const site = { domain: "example.com", state: "queued", phase: "index", pull_all: true, platform: "shopify",
    currency: "ILS", cursor_page: 1, index_group: 212, index_page: 1, pull_checked: 0, pulled: 0, issues: [],
    selection: [], categories, attempts: 0, pull_started_at: "2026-11-27T15:00:00Z",
    source_index: { "42": { handle: "shoe", categories: ["old"] } } };
  const saved = [];
  const counts = [];
  const audits = [];
  const worker = moduleFor("sites", {
    "server-only": {}, "@/lib/shopify/config": {}, "./import-queue": { processNextImport: async () => {} },
    "./category-audit": { readSupplierCategoryAudit: async () => audits.push(site.state) },
    "./catalog-model": model, "./woocommerce": {}, "./public-source": { sourceReader: async () => async () => assert.fail("legacy full pull must skip extra collection requests") },
    "./shopify-source": { ...source, readShopifyProduct: async (_, domain, id, currency, seeded, all) => {
      assert.equal(domain, site.domain);
      assert.deepEqual(seeded, []);
      assert.deepEqual(all, categories);
      return { id, categoryIds: ["1"] };
    } },
    "./storage": { shopFilter: () => ({}), supplierRequest: async (_, method, filters, values) => {
      if (method === "PATCH") {
        Object.assign(site, values);
        if (values.pull_total !== undefined) counts.push(values.pull_total);
      }
      return [{ ...site }];
    }, savePreview: async snapshot => saved.push(snapshot) },
  });
  await worker.processCatalogJobs();
  assert.deepEqual(saved, [{ id: "42", categoryIds: ["1"] }]);
  assert.deepEqual(counts, [1, 1, 1]);
  assert.equal(site.state, "complete");
  assert.deepEqual(audits, ["complete"]);
});
test("Storefront product pages preserve availability, prices, images, and reject incomplete variants", async () => {
  const {readShopifyProduct}=moduleFor("shopify-source",{
    "server-only":{},"./public-source":{},"./catalog-model":moduleFor("catalog-model"),"@/lib/brands":siteBrands,
  });
  const page=(nodes,more=false)=>({nodes,pageInfo:{hasNextPage:more,endCursor:more?"cursor":null}});
  const money=amount=>({amount,currencyCode:"ILS"});
  const v={id:"gid://shopify/ProductVariant/123",price:money("110"),compareAtPrice:money("125"),
    availableForSale:true,currentlyNotInStock:true,selectedOptions:[{name:"Size",value:"M"}]};
  const other={...v,id:"gid://shopify/ProductVariant/124",currentlyNotInStock:false,selectedOptions:[{name:"Size",value:"L"}],
    image:{url:"https://cdn.shopify.com/l.jpg"}};
  const read=async(_,body)=>({data:{data:{product:{
    id:"gid://shopify/Product/42",handle:"boot",title:"Boot",options:[{name:"Size",values:["M","L"]}],
    images:page([{url:"https://res.cloudinary.com/demo/image/upload/boot.jpg"}]),
    variants:body.variables.variants?page([other]):page([v],true)
  }}}});
  const scan=()=>readShopifyProduct(read,"example.com","42","ILS",[{id:"1",name:"Boots"}]);
  const result=await scan();
  assert.deepEqual(result.variants.map(v=>[v.id,v.available,v.price,v.regular]),[["123",false,125,125],["124",true,125,125]]);
  assert.deepEqual(result.images,["https://res.cloudinary.com/demo/image/upload/boot.jpg","https://cdn.shopify.com/l.jpg"]);
  delete v.availableForSale;
  await assert.rejects(scan);
});
test("a scoped Shopify pull reads additional collections on products already selected for the pull", async () => {
  const { readShopifyProduct } = moduleFor("shopify-source", { "server-only": {}, "./public-source": {}, "./catalog-model": moduleFor("catalog-model"), "@/lib/brands": siteBrands });
  const calls = [];
  const collection = id => ({ id: "gid://shopify/Collection/" + id });
  const page = (nodes, endCursor = null) => ({ nodes, pageInfo: { hasNextPage: !!endCursor, endCursor } });
  const read = async (_, { variables }) => {
    calls.push([variables.categories, variables.getImages, variables.getVariants]);
    return { data: { data: { product: {
      id: "gid://shopify/Product/42", handle: "boot", title: "Boot", productType: "Work boots",
      options: [{ name: "Size", values: ["M"] }],
      collections: variables.categories ? page([collection("2")]) : page([collection("1")], "next"),
      images: page([{ url: "https://cdn.shopify.com/boot.jpg" }]),
      variants: page([{
        id: "gid://shopify/ProductVariant/123", price: { amount: "100", currencyCode: "ILS" },
        availableForSale: true, currentlyNotInStock: false, selectedOptions: [{ name: "Size", value: "M" }],
      }]),
    } } } };
  };
  const selected = [{ id: "1", name: "Footwear" }];
  const result = await readShopifyProduct(read, "example.com", "42", "ILS", selected, [...selected, { id: "2", name: "New collection" }]);
  assert.deepEqual(calls, [[null, true, true], ["next", false, false]]);
  assert.deepEqual(result.categoryIds, ["1", "2"]);
  assert.equal(result.productType, "Work boots");
});
test("monitor discoveries keep previous approvals and dismissals across retries", async () => {
  const ops=[];
  let exists=false;
  const net=global.fetch;
  const prevURL=process.env.SUPABASE_URL,prevKey=process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_URL="https://db.example";process.env.SUPABASE_SECRET_KEY="fake";
  try {
    global.fetch=async (url,opts)=>{
      const body=JSON.parse(opts.body);ops.push(body);
      const ignored=exists && opts.headers.Prefer.includes("ignore-duplicates");exists=true;
      return Response.json(ignored?[]:[body]);
    };
    const storage=moduleFor("storage",{"server-only":{},"@/lib/shopify/config":{shopDomain:()=>"shop.example"},
      "./catalog-model":moduleFor("catalog-model")});
    await storage.savePreview({id:"1",domain:"source.example"},true);
    await storage.savePreview({id:"1",domain:"source.example"},true);
    assert.equal(ops[0].review_state,"pending");
    assert.equal(ops[1].review_state,"pending");
    assert.ok(!Object.hasOwn(ops[2],"review_state"));
  } finally {
    global.fetch=net;
    if(prevURL===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=prevURL;
    if(prevKey===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=prevKey;
  }
});
const parent = {
  id: 30,
  type: "variable",
  name: "Boot",
  permalink: "https://example.com/boot",
  attributes: [
    {
      name: "Size",
      terms: [
        { name: "Small", slug: "s" },
        { name: "Medium", slug: "m" },
      ],
    },
  ],
  variations: [
    { id: 31, attributes: [{ name: "Size", value: "s" }] },
    { id: 32, attributes: [{ name: "Size", value: "m" }] },
  ],
  images: [{ src: sourceImage }],
  prices: { currency_code: "ILS" },
  categories: [{ id: 1, name: "Boots" }],
  description: "<p>Boot</p>",
};
const row = (id, stock) => ({
  id,
  parent: 30,
  sku: "shared",
  is_in_stock: stock,
  is_purchasable: true,
  prices: { price: "10000", regular_price: "12000", currency_minor_unit: 2, currency_code: "ILS" },
  images: [{ src: "https://example.com/" + id + ".jpg" }, { src: "https://res.cloudinary.com/demo/image/upload/side.jpg" }],
});
test("reads every declared combination, including sold-out sizes and secondary variation images", async () => {
  const result = await readWooProduct(
    async () => ({ data: [row(32, false), row(31, true)], headers: {} }),
    domain,
    parent,
  );
  assert.deepEqual(
    result.variants.map((v) => [v.id, v.options["מידה"], v.available]),
    [
      ["31", "Small", true],
      ["32", "Medium", false],
    ],
  );
  assert.equal(result.images.length, 4);
  assert.ok(result.images.includes("https://res.cloudinary.com/demo/image/upload/side.jpg"));
  assert.deepEqual(result.variants.map((v) => [v.price, v.regular]), [[120, 120], [120, 120]]);
});
test("a variation that is in stock but not for sale is ignored, and a sold-out size stays", async () => {
  const hidden = { ...row(33, true), is_purchasable: false, images: [{ src: "http://10.1.2.3/secret.jpg" }] };
  const soldOut = { ...row(34, false), is_purchasable: false };
  const product = {
    ...parent,
    variations: [
      { id: 31, attributes: [{ name: "Size", value: "s" }] },
      { id: 33, attributes: [{ name: "Size", value: "s" }] },
      { id: 34, attributes: [{ name: "Size", value: "m" }] },
    ],
  };
  const result = await readWooProduct(
    async () => ({ data: [row(31, true), hidden, soldOut], headers: {} }),
    domain,
    product,
  );
  assert.deepEqual(
    result.variants.map((v) => [v.id, v.options["מידה"], v.available]),
    [
      ["31", "Small", true],
      ["34", "Medium", false],
    ],
  );
  assert.ok(!result.images.some((image) => image.includes("10.1.2.3")));
});
test("a supplier brand attribute maps onto the existing site brand", async () => {
  const product = {
    ...parent,
    attributes: [...parent.attributes, { name: "מותג", taxonomy: "pa_brand", terms: [{ name: "Carhartt Footwear", slug: "carhartt-footwear" }] }],
  };
  const result = await readWooProduct(
    async () => ({ data: [row(32, false), row(31, true)], headers: {} }),
    domain,
    product,
  );
  assert.equal(result.brand, "Carhartt");
});
test("a repeated color and size names the duplicated combination", async () => {
  const duplicate = {
    ...parent,
    variations: [
      { id: 31, attributes: [{ name: "Size", value: "s" }] },
      { id: 32, attributes: [{ name: "Size", value: "s" }] },
    ],
  };
  await assert.rejects(
    readWooProduct(async () => ({ data: [row(31, true), row(32, true)], headers: {} }), domain, duplicate),
    (error) => {
      assert.match(error.message, /הספק רשם יותר מפעם אחת את אותו שילוב: מידה Small/);
      return true;
    },
  );
});
test("a partial variation response cannot replace known availability", async () => {
  await assert.rejects(readWooProduct(async () => ({ data: [row(32, false)], headers: {} }), domain, parent));
});
test("bulk import includes the entire category subtree across pages and keeps the approved prices", async () => {
  const imports = [];
  const seen = [];
  const api = moduleFor("import-queue", {
    "./brand": supplierBrand,
    "./category-matching": categoryMatching,
    "server-only": {}, "@/lib/shopify/config": {shopDomain: () => "test.myshopify.com"},
    "./shopify": {}, "./catalog-model": moduleFor("catalog-model"),
    "./storage": {shopFilter: () => ({}), supplierRequest: async (table, method, params, body) => {
      if (table === "ahim_supplier_previews") {
        seen.push(params);
        const make = id => ({source_id:String(id), revision:"abc", manual_price:id===301?119:null, category_ids:["2"], currency:"ILS"});
        return params.source_id ? [make(301)] : Array.from({length:300}, (_,i)=>make(i+1));
      }
      if (method === "POST") imports.push(...body);
      return [];
    }},
  });
  await api.queueImports({domain:"example.com",categories:[{id:"1",parent:"0"},{id:"2",parent:"1"}],
    mappings:{"1":["collection"]},percent:10},[],"1");
  assert.equal(imports.length,301);
  assert.deepEqual(seen.map(q=>q.category_ids),["ov.{1,2}","ov.{1,2}"]);
  assert.deepEqual(imports[300].collection_ids,["collection"]);
  assert.equal(imports[300].manual_price,119);
  assert.equal(imports[0].percent,10);
});
test("a scrolling selection can include more than 100 distinct products without widening its scope", async () => {
  const ids = Array.from({length:125}, (_, i) => String(2*i+1));
  const groups = [], queued = [];
  const api = moduleFor("import-queue", {
    "./brand": supplierBrand,
    "./category-matching": categoryMatching,
    "server-only":{}, "@/lib/shopify/config":{shopDomain:()=>"test"}, "./shopify":{},
    "./catalog-model":moduleFor("catalog-model"),
    "./storage":{shopFilter:()=>({}), supplierRequest:async (table,method,params,body)=>{
      if (table === "ahim_supplier_previews") {
        assert.match(params.source_id,/^in\.\(.+\)$/);
        const slice=params.source_id.slice(4,-1).split(",");
        groups.push(slice.length);
        return slice.map(source_id=>({source_id,revision:"r",manual_price:null,category_ids:["1"],currency:"ILS"}));
      }
      if (method === "POST") { queued.push(...body); return body; }
      return [];
    }},
  });
  await api.queueImports({domain:"example.com",categories:[{id:"1",parent:"0"}],
    mappings:{1:["collection"]},percent:0},[...ids,ids[0]]);
  assert.deepEqual(groups,[100,25]);
  assert.deepEqual(queued.map(t=>t.source_id),ids);
});
test("catalog scrolling requests the next filtered batch and checks one extra row for the end", async () => {
  const model=moduleFor("catalog-model");
  const site={domain:"example.com",percent:0,categories:[{id:"1",parent:"0"},{id:"2",parent:"1"}]};
  const requests=[];
  const data=Array.from({length:24},(_,i)=>({source_id:String(i+1),manual_price:null,category_ids:["2"],
    snapshot:{id:String(i+1),variants:[{price:100,regular:100}],images:["img"]}}));
  const api=moduleFor("catalog-batch",{"server-only":{},"./catalog-model":model,"./brand":supplierBrand,
    "./publication":{catalogPublicationStates:async()=>[]},"./import-queue":{importStatuses:async()=>[]},
    "./storage":{previews:async(domain,params)=>{
      assert.equal(domain,site.domain);requests.push(params);
      return data.slice(+params.offset,+params.offset + +params.limit);
    }},
  });
  const first=await api.readCatalogBatch(site,"1",1),second=await api.readCatalogBatch(site,"1",2);
  assert.deepEqual([first.more,second.more],[true,false]);
  assert.deepEqual([...first.items,...second.items].map(i=>i.id),data.map(row=>row.source_id));
  assert.deepEqual(requests.map(r=>[r.offset,r.limit,r.category_ids,r.review_state]),[
    ["0","13","ov.{1,2}","eq.known"],["12","13","ov.{1,2}","eq.known"],
  ]);
});
test("imported catalog filters before pagination and reports Shopify draft and storefront states", async () => {
  const model = moduleFor("catalog-model");
  const site = { domain: "example.com", percent: 0, categories: [{ id: "1", parent: "0" }] };
  const requests = [];
  const rows = Array.from({ length: 28 }, (_, index) => {
    const id = String(index + 1);
    return {
      source_id: id,
      shopify_product_id: index % 2 === 0 ? "gid" + id : null,
      review_state: index === 0 ? "ignored" : "known",
      category_ids: ["1"],
      manual_price: null,
      snapshot: { id, variants: [{ price: 100, regular: 100 }], images: ["img"] },
    };
  });
  const api = moduleFor("catalog-batch", {
    "./brand": supplierBrand,
    "server-only": {},
    "./catalog-model": model,
    "./storage": { previews: async (domain, params) => {
      assert.equal(domain, site.domain);
      requests.push(params);
      const imported = rows.filter(row => row.shopify_product_id);
      return imported.slice(Number(params.offset), Number(params.offset) + Number(params.limit));
    } },
    "./publication": { catalogPublicationStates: async ids => ids.map(id => ({
      id, handle: "example-product", status: id === "gid1" ? "DRAFT" : "ACTIVE", onSite: id !== "gid1",
    })) },
    "./import-queue": { importStatuses: async () => [] },
  });
  const first = await api.readCatalogBatch(site, "1", 1, true);
  const second = await api.readCatalogBatch(site, "1", 2, true);
  assert.deepEqual([first.more, second.more], [true, false]);
  assert.deepEqual([...first.items, ...second.items].map(item => item.id),
    rows.filter(row => row.shopify_product_id).map(row => row.source_id));
  assert.deepEqual(requests.map(r => [r.shopify_product_id, r.review_state, r.category_ids, r.offset]), [
    ["not.is.null", undefined, "ov.{1}", "0"], ["not.is.null", undefined, "ov.{1}", "12"],
  ]);
  assert.equal(first.items[0].shopifyStatus, "DRAFT");
  assert.equal(first.items[0].siteUrl, undefined);
  assert.equal(first.items[1].siteUrl, "/p/example-product");
});
test("monitor imports an individual discovery or the full pending list across pages", async () => {
  const ids = Array.from({ length: 312 }, (_, index) => String(index + 1)).sort();
  const candidates = ids.map(source_id => ({
    source_id, title: "New product", revision: "r", category_ids: ["1"], shopify_product_id: null,
  }));
  const tasks = [];
  const queried = [];
  const preview = {
    source_id: "9", review_state: "pending", revision: "r", manual_price: null, shopify_product_id: null,
    snapshot: { variants: [{ price: 100, regular: 100 }] },
  };
  const api = moduleFor("import-queue", {
    "./brand": supplierBrand, "./brand-settings": testBrandSettings,
    "./category-matching": categoryMatching,
    "server-only": {}, "@/lib/shopify/config": { shopDomain: () => "shop.example" },
    "./catalog-model": moduleFor("catalog-model"),
    "./shopify": { importDraft: async row => { assert.equal(row, preview); preview.review_state = "known"; } },
    "./storage": {
      shopFilter: () => ({ shop_domain: "eq.shop.example" }), getPreview: async () => preview,
      supplierRequest: async (table, method, filters, values) => {
        if (table === "ahim_supplier_previews") {
          assert.equal(filters.review_state,"eq.pending");
          assert.equal(filters.shopify_product_id,"is.null");
          assert.equal(filters.supplier,"eq.example.com");
          queried.push(filters.source_id);
          if (filters.source_id?.startsWith("in.")) return candidates.filter(row => row.source_id === "9");
          return candidates.filter(row => !filters.source_id || row.source_id > filters.source_id.slice(3)).slice(0,300);
        }
        if (method === "POST") { tasks.push(...values); return values; }
        if (method === "PATCH") return [{ ...tasks[0], ...values }];
        if (filters.available_at) return [tasks[0]];
        return [];
      },
    },
  });
  const site = { domain: "example.com", percent: 0, categories: [{ id: "1", parent: "0" }], mappings: { "1": ["collection"] } };
  assert.equal((await api.queueImports(site, ["9"], undefined, "draft", "pending")).queued, 1);
  assert.equal(tasks[0].source_id, "9");
  tasks[0].manual_price = null;
  await api.processNextImport();
  assert.equal(preview.review_state, "known");
  tasks.length = 0;
  assert.equal((await api.queueImports(site, [], "", "draft", "pending")).queued, ids.length);
  assert.deepEqual(queried, ["in.(9)",undefined,"gt." + ids[299]]);
  assert.deepEqual(tasks.map(task => task.source_id), ids);
  assert.ok(tasks.every(task => task.intent === "draft"));
});
test("publishing a selection uses the latest saved category and resumes from the linked draft after a failure", async () => {
  const task = {domain:"example.com",source_id:"1",revision:"r",manual_price:null,percent:10,
    collection_ids:["collection"],intent:"publish",attempts:0,state:"queued"};
  const row = {source_id:"1",revision:"r",manual_price:null,review_state:"known",scan_error:null,
    shopify_product_id:null,collection_ids:["new-category"],snapshot:{variants:[{price:100,regular:100}]}};
  const calls=[];
  const api=moduleFor("import-queue",{
    "./brand": supplierBrand, "./brand-settings": { readSupplierDefaultBrand: async () => "Redback" },
    "./category-matching": categoryMatching,
    "server-only":{}, "@/lib/shopify/config":{}, "./catalog-model":moduleFor("catalog-model"),
    "./storage":{shopFilter:()=>({}),getPreview:async()=>({...row}),
      supplierRequest:async(_,method,filters,values)=>{
        if(method==="PATCH")Object.assign(task,values);
        return [{...task}];
      }},
    "./shopify":{importDraft:async(_,collections,p)=>{
      assert.deepEqual(collections,["new-category"]);assert.equal(p.variants[0].price,110);assert.equal(p.brand,"Redback");
      row.shopify_product_id="existing-draft";calls.push("import");return {id:"existing-draft"};
    }},
    "./publication":{refreshLinkedProduct:async(p,publish)=>{
      assert.equal(p.shopify_product_id,"existing-draft");assert.equal(publish,true);
      calls.push("publish");if(calls.length===2)throw Error("temporary");return {live:true};
    }},
  });
  await api.processNextImport();
  assert.equal(task.state,"queued");assert.equal(task.error,"temporary");
  await api.processNextImport();
  assert.deepEqual(calls,["import","publish","publish"]);assert.equal(task.state,"done");
});
test("bulk publication uses per-product category choices, includes existing drafts and skips live and unassigned products", async () => {
  const products=["1","2","3","4","5"].map((id,i)=>({source_id:id,revision:"r",manual_price:null,
    category_ids:i===3?[]:["1"],collection_ids:i<2?["approved"]:i===2?["product-choice"]:[],shopify_product_id:i<2?"gid"+id:null}));
  let submitted=[];
  const api=moduleFor("import-queue",{
    "./brand": supplierBrand,
    "./category-matching": categoryMatching,
    "server-only":{},"@/lib/shopify/config":{shopDomain:()=>"shop.test"},"./catalog-model":moduleFor("catalog-model"),"./shopify":{},
    "./publication":{catalogPublicationStates:async()=>[{id:"gid1",status:"DRAFT",onSite:false},{id:"gid2",status:"ACTIVE",onSite:true}]},
    "./storage":{shopFilter:()=>({}),supplierRequest:async(table,method,params,body)=>{
      if(table==="ahim_supplier_previews"){assert.equal(params.shopify_product_id,undefined);return products}
      if(method==="POST"){submitted=body;return body}
      return [];
    }},
  });
  const result=await api.queueImports({domain:"vendor.test",categories:[{id:"1",parent:"0"}],mappings:{1:["collection"]},percent:0},[],"","publish");
  assert.deepEqual(submitted.map(t=>[t.source_id,t.intent,t.collection_ids]),
    [["1","publish",["approved"]],["3","publish",["product-choice"]],["5","publish",["collection"]]]);
  assert.equal(result.queued,3);assert.equal(result.skipped.length,2);
});

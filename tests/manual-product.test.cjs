const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const ts = require("typescript");

function load(file, deps = {}) {
  const code = ts.transpileModule(readFileSync(resolve(__dirname, "..", file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {};
  new Function("require", "exports", code)(id => deps[id] ?? require(id), exports);
  return exports;
}

const brands = load("lib/brands.ts");
const gallerySettings = load("lib/product-gallery.ts");
let uploadCount = 0;
const uploads = load("lib/admin/product-image-upload.ts", {
  "server-only": {}, "@/lib/product-gallery": gallerySettings,
  "@/lib/suppliers/shopify": { stageProductImage: async (_file, filename) => `https://shop.example/${++uploadCount}/${filename}` },
});
const categories = [{ id: "work", name: "עבודה", subs: ["חולצות"] }, { id: "winter", name: "חורף", subs: [] }];
const requestId = "45678000-0000-4000-abcd-000000000001";
function form(sale = "") {
  const form = new FormData();
  for (const [key, value] of Object.entries({ requestId, title: "חולצה", brand: "מותג / חדש", description: "חולצה <קלה>", regular: "99.90", sale })) form.set(key, value);
  form.append("parent", "work");
  form.append("sub", "חולצות");
  form.append("parent", "winter");
  form.append("sub", "");
  return form;
}

function shop(failOnce = false) {
  const created = [];
  let product;
  const api = load("lib/admin/create-product.ts", {
    "server-only": {}, "@/lib/brands": brands, "@/lib/catalog": { CATS: categories },
    "@/lib/product-gallery": gallerySettings, "./product-image-upload": uploads,
    "@/lib/category-placement": load("lib/category-placement.ts"), "./storage": { readAdminStore: async () => ({}) },
    "@/lib/suppliers/shopify": {}, "@/lib/suppliers/storefront-collections": { supplierStorefrontCollections: async () => [
      { id: "shirts", published: true, manual: true, paths: [{ parentId: "work", sub: "חולצות" }] },
      { id: "auto", published: true, manual: false, paths: [{ parentId: "winter", sub: "" }] },
    ] },
    "@/lib/suppliers/category-approval": { saveStorefrontCategory: async (label, parent) => {
      assert.deepEqual([label, parent], ["חורף", ""]);
      return { id: "winter-manual" };
    } },
    "@/lib/suppliers/publication": { sitePublication: () => "site", makeVisible: async item => {
      if (failOnce) { failOnce = false; throw new Error("publication temporarily unavailable"); }
      item.onSite = true;
      item.status = "ACTIVE";
    } },
    "@/lib/shopify/admin-bundles": { adminGraphQL: async (query, variables) => {
      assert.equal(variables.channel, "site");
      if (query.includes("query ManualSubmission")) return { productByIdentifier: product ?? null };
      assert.match(query, /mutation CreateManualProduct/);
      const { input } = variables;
      created.push(input);
      product = { id: "gid://shopify/Product/7", status: input.status, handle: input.handle, submission: input.metafields[0], onSite: false };
      return { productSet: { userErrors: [], product } };
    } },
    "@/lib/shopify/client": { storefront: async () => ({ product: product.onSite && product.status === "ACTIVE" ? product : null }) },
  });
  return { ...api, created };
}

for (const sale of ["", "79.50"]) test(`manual product publishes with ${sale ? "a sale price" : "regular price only"} and selected collections`, async () => {
  const api = shop();
  const input = await api.readProductForm(form(sale));
  const handle = await api.publishManualProduct(input);
  const [product] = api.created;
  assert.equal(product.vendor, "מותג / חדש");
  assert.deepEqual(product.collections, ["shirts", "winter-manual"]);
  assert.equal(product.descriptionHtml, "<p>חולצה &lt;קלה&gt;</p>");
  assert.equal(product.variants[0].price, sale || "99.90");
  assert.equal(product.variants[0].compareAtPrice, sale ? "99.90" : null);
  const directory = brands.catalogBrands([{ id: handle, brand: product.vendor }, { id: handle + "2", brand: product.vendor }]);
  assert.equal(directory.filter(brand => brand.name === product.vendor).length, 1);
  assert.match(directory.at(-1).id, /^brand-[a-f0-9]+$/);
});

test("retry after a partial publication resumes the saved product and rejects changed data", async () => {
  const api = shop(true);
  const input = await api.readProductForm(form());
  await assert.rejects(api.publishManualProduct(input), /temporarily unavailable/);
  await assert.rejects(api.publishManualProduct({ ...input, title: "מוצר שונה" }), /לא ניתן להשלים/);
  assert.equal(await api.publishManualProduct(input), await api.publishManualProduct(input));
  assert.equal(api.created.length, 1);
});

test("invalid prices, mismatched taxonomy and blank brand are rejected before Shopify writes", async () => {
  const api = shop();
  for (const [key, value] of [["sale", "99.90"], ["sale", "120"], ["regular", "0"], ["regular", "1.005"], ["brand", "  "], ["sub", "unknown"]]) {
    const data = form();
    if (key === "sub") { data.delete("parent"); data.append("parent", "work"); }
    data.set(key, value);
    await assert.rejects(api.readProductForm(data), api.InvalidProduct);
  }
  assert.deepEqual(api.created, []);
});

test("only a signed-in admin posting from the store can reach the creation workflow", async () => {
  for (const [origin, admin, status] of [[false, true, 403], [true, false, 401]]) {
    const route = load("app/admin/products/route.ts", {
      "@/lib/admin/access": { isAdmin: async () => admin }, "@/lib/admin/request-origin": { adminRequestOrigin: () => origin },
      "@/lib/admin/create-product": {}, "@/lib/shopify/load-catalog": {}, "next/cache": {},
      "@/lib/admin/product-image-upload": uploads,
    });
    assert.equal((await route.POST(new Request("https://example.test/admin/products", { method: "POST" }))).status, status);
  }
});

test("gallery preserves the cover and order, and can resume with freshly staged copies", async t => {
  const old = process.env.SHOPIFY_CLIENT_SECRET;
  process.env.SHOPIFY_CLIENT_SECRET = "test-gallery-secret";
  t.after(() => { if (old === undefined) delete process.env.SHOPIFY_CLIENT_SECRET; else process.env.SHOPIFY_CLIENT_SECRET = old; });
  const sharp = require("sharp");
  const picture = async background => new Blob([await sharp({ create: { width: 2, height: 2, channels: 3, background } }).png().toBuffer()], { type: "image/png" });
  const photos = await Promise.all(["red", "blue"].map(picture));
  const api = shop(true);
  async function submission(order) {
    const data = form();
    for (const index of order) data.append("gallery", await uploads.uploadProductImage(photos[index], requestId));
    return api.readProductForm(data);
  }
  const initial = await submission([1, 0]);
  await assert.rejects(api.publishManualProduct(initial), /temporarily unavailable/);
  assert.deepEqual(api.created[0].files.map(file => file.originalSource), initial.gallery.map(file => file.originalSource));
  await assert.rejects(api.publishManualProduct(await submission([0, 1])), /לא ניתן להשלים/);
  await api.publishManualProduct(await submission([1, 0]));
  assert.equal(api.created.length, 1);
  const other = form();
  other.set("gallery", await uploads.uploadProductImage(photos[0], "55678000-0000-4000-abcd-000000000001"));
  await assert.rejects(api.readProductForm(other), uploads.InvalidProductImage);
  const oversized = form();
  for (let n = 0; n <= gallerySettings.galleryLimit; n++) oversized.append("gallery", "unused");
  await assert.rejects(api.readProductForm(oversized), api.InvalidProduct);
});

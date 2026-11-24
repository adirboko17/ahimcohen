const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { test } = require("node:test");
const ts = require("typescript");

function load(file, deps = {}, fetch, env = {}) {
  const source = ts.transpileModule(readFileSync(resolve(__dirname, "..", file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", "fetch", "process", source)((id) => deps[id] ?? require(id), module, module.exports, fetch, { env });
  return module.exports;
}

for (const kind of ["bundle", "quantity-offer"]) test(`managed ${kind} creates, updates and archives its own Shopify product`, async () => {
  const publicationId = "gid://shopify/Publication/42";
  const productId = "gid://shopify/Product/100";
  const firstId = "gid://shopify/ProductVariant/11";
  const secondId = "gid://shopify/ProductVariant/12";
  const source = { id: "shirt", name: "Shirt", choices: [{ id: firstId, color: "Blue", size: "M" }, { id: secondId, color: "White", size: "L" }] };
  const mappingKey = kind === "quantity-offer" ? "quantity-offer:shirt" : "shirt";
  const tiers = [
    { id: "pair", name: "Pair", items: [[source.id, 2]], total: 70, sourceVariantIds: [firstId, secondId] },
    { id: "triple", name: "Triple", items: [[source.id, 3]], total: 99, sourceVariantIds: [firstId] },
  ];
  let shopifyProduct = null;
  let mapping = null;
  const setRequests = [];
  const publications = [];
  const archives = [];
  let storefrontReads = 0;
  const { syncManagedBundle } = load("lib/shopify/admin-bundles.ts", {
    "server-only": {},
    "@/lib/admin/models": load("lib/admin/models.ts"),
    "./config": { shopDomain: () => "test.myshopify.com", storefrontApiVersion: () => "2026-10" },
    "@/lib/admin/bundle-mapping": {
      bundleRevision: (values) => values.map(({ total }) => total).join("-"),
      fetchBundleMappings: async (key) => { assert.equal(key, mappingKey); return mapping ? [mapping] : []; },
      saveBundleMapping: async (value) => { mapping = value; },
    },
    "./client": { storefront: async (_query, { ids }) => {
      if (++storefrontReads === 1) return { nodes: ids.map(() => null) };
      return { nodes: ids.map((id) => {
        const item = shopifyProduct.variants.nodes.find((variant) => variant.id === id);
        return { id, availableForSale: true, price: { amount: item.price, currencyCode: "ILS" } };
      }) };
    } },
  }, async (url, request) => {
    assert.match(url, /^https:\/\/test\.myshopify\.com\/admin\/api\//);
    const { query, variables } = JSON.parse(request.body);
    if (query.includes("query BundleTarget")) return Response.json({ data: { productByIdentifier: shopifyProduct } });
    if (query.includes("mutation SetBundle")) {
      setRequests.push(variables);
      shopifyProduct = {
        id: productId, tags: variables.input.tags, publishedOnPublication: !!shopifyProduct?.publishedOnPublication,
        variants: { nodes: variables.input.variants.map(({ id, sku, price }, i) => ({ id: id ?? `gid://shopify/ProductVariant/${101 + i}`, sku, price })) },
      };
      return Response.json({ data: { productSet: { product: shopifyProduct, userErrors: [] } } });
    }
    if (query.includes("mutation PublishBundle")) {
      publications.push(variables);
      shopifyProduct.publishedOnPublication = true;
      return Response.json({ data: { publishablePublish: { userErrors: [] } } });
    }
    if (query.includes("mutation ArchiveBundle")) {
      archives.push(variables.product);
      return Response.json({ data: { productUpdate: { userErrors: [] } } });
    }
    assert.fail("Unexpected Shopify query");
  }, { SHOPIFY_ADMIN_API_TOKEN: "mock-admin-token", SHOPIFY_BUNDLE_PUBLICATION_ID: publicationId });

  await syncManagedBundle(source.id, source, tiers, kind);
  assert.equal(storefrontReads, 2);
  assert.equal(setRequests[0].input.title, kind === "quantity-offer" ? "Shirt — מבצע כמות" : "Shirt — באנדל");
  assert.equal(setRequests[0].input.variants[0].sku, kind === "quantity-offer" ? "AHQ-2-11" : "AHB-2-11");
  assert.deepEqual(setRequests[0].input.variants.map(({ price, inventoryItem }) => [price, inventoryItem.tracked]), [["70.00", false], ["70.00", false], ["99.00", false]]);
  assert.deepEqual(publications, [{ id: productId, input: [{ publicationId }] }]);
  assert.equal(mapping.shopify_product_id, productId);
  assert.equal(mapping.source_product_id, mappingKey);
  assert.deepEqual(mapping.variants.map(({ sourceVariantId, price }) => [sourceVariantId, price]), [[firstId, 70], [secondId, 70], [firstId, 99]]);
  const ids = mapping.variants.map(({ variantId }) => variantId);
  await syncManagedBundle(source.id, source, [{ ...tiers[0], total: 75 }, tiers[1]], kind);
  assert.deepEqual(setRequests[1].identifier, { id: productId });
  assert.deepEqual(setRequests[1].input.variants.map(({ id }) => id), ids);
  assert.equal(mapping.variants[0].price, 75);
  assert.equal(publications.length, 1);
  await syncManagedBundle(source.id, undefined, [], kind);
  assert.deepEqual(archives, [{ id: productId, status: "ARCHIVED" }]);
  assert.deepEqual(mapping.variants, []);
});

test("Supabase mapping requests use the server secret and scope each row to the Shopify shop", async () => {
  const requests = [];
  const { fetchBundleMappings, saveBundleMapping } = load("lib/admin/bundle-mapping.ts", {
    "server-only": {}, "@/lib/shopify/config": { shopDomain: () => "test.myshopify.com" },
  }, async (url, init) => {
    requests.push({ url, init });
    return init.method ? new Response(null, { status: 201 }) : Response.json([]);
  }, { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SECRET_KEY: "sb_secret_mock" });
  await fetchBundleMappings("quantity-offer:סווטשירט-5-25");
  await saveBundleMapping({ source_product_id: "shirt", shopify_product_id: "gid://shopify/Product/100", revision: "test", variants: [] });
  assert.equal(requests[0].url.searchParams.get("shop_domain"), "eq.test.myshopify.com");
  assert.equal(requests[0].url.searchParams.get("source_product_id"), "eq.quantity-offer:סווטשירט-5-25");
  assert.equal(requests[0].init.headers.apikey, "sb_secret_mock");
  assert.equal(requests[1].init.headers.Prefer, "resolution=merge-duplicates,return=minimal");
  assert.equal(JSON.parse(requests[1].init.body).shop_domain, "test.myshopify.com");
});

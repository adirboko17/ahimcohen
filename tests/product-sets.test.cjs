const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const ts = require("typescript");

function load(file, deps = {}) {
  const code = ts.transpileModule(readFileSync(resolve(__dirname, "..", file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const result = { exports: {} };
  new Function("require", "module", "exports", code)(id => deps[id] ?? require(id), result, result.exports);
  return result.exports;
}
const sets = load("lib/product-sets.ts", { "./product-recommendations": load("lib/product-recommendations.ts") });
const products = ["shirt", "belt"].map((id, i) => ({ id, name: id, price: 50, sizes: ["M"], colors: ["black"], choices: [
  { id: "gid://shopify/ProductVariant/" + (i + 1), color: "black", size: "M", available: true, price: 50 },
] }));

function command(mode, revision = "", extra, price) {
  const form = new FormData();
  for (const [key, value] of Object.entries({ productId: "shirt", revision, mode, extra, price })) {
    if (value !== undefined) form.set(key, value);
  }
  return form;
}

test("the admin overview shows saved set overrides newest first with edit links and their price or visibility", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { AdminProductSets } = load("components/AdminProductSets.tsx", {
    "next/link": { default: ({ href, children }) => React.createElement("a", { href }, children) },
    "next/navigation": { useRouter: () => ({}) },
    "@/lib/catalog-context": { useCatalog: () => ({ product: id => {
      const item = products.find(p => p.id === id);
      return item && { ...item, imgs: ["/" + id + ".jpg"] };
    } }) },
    "@/lib/pricing": { fmt: price => price + " ₪" }, "@/lib/product-sets": sets,
    "./AdminControls": { AdminProductField: () => null, AdminProductSummary: ({ item }) => item.name },
    "./ProductImage": { ProductImage: ({ src, alt }) => React.createElement("img", { src, alt }) },
    "./icons": { IconBag: () => null, IconPencil: () => null },
  });
  const render = settings => renderToStaticMarkup(React.createElement(AdminProductSets, { settings }));
  const html = render([{ id: "belt", mode: "hidden", extras: [] }, { id: "shirt", mode: "custom", price: 80, extras: ["belt"] }]);
  assert.equal((html.match(/<li class="catalog-product">/g) ?? []).length, 2);
  assert.match(html, /class="admin-set-previews"><img src="\/belt.jpg"/);
  assert.match(html, /shirt[\s\S]*מחיר הסט[\s\S]*80 ₪[\s\S]*product=shirt#set-editor[\s\S]*belt[\s\S]*מוסתר/);
  assert.match(render([]), /עדיין אין סטים בעריכה אישית/);
});

test("an administrator can replace, hide and reset a set without overwriting another product or a newer edit", async () => {
  const other = { id: "belt", revision: "keep", mode: "hidden", extras: [] };
  const store = { sets: [other] };
  const archived = [];
  const { saveProductSet } = load("lib/admin/product-sets.ts", {
    "server-only": {}, "next/cache": { revalidatePath() {} },
    "./storage": { changeAdminStore: fn => fn(store) },
    "@/lib/shopify/load-catalog": { loadShopCatalog: async () => ({ products }) },
    "@/lib/shopify/product-set-offer": {
      prepareSetOffer: async (items, price, onPublish) => {
        assert.deepEqual(items, products);
        onPublish("parent");
        return { shopifyId: "parent", price, variants: [] };
      },
      setOfferStatus: async (...args) => archived.push(args),
    },
  });
  for (const form of [command("custom", "", "shirt"), command("custom", "", "missing"), command("custom", "", "belt", "100")]) {
    assert.equal((await saveProductSet(form)).ok, false);
  }
  assert.equal((await saveProductSet(command("custom", "", "belt", "80"))).ok, true);
  const saved = store.sets[1];
  assert.deepEqual(sets.setExtras(products[0], products, saved), [products[1]]);
  assert.equal(saved.offer.price, 80);
  assert.equal((await saveProductSet(command("hidden"))).ok, false);
  assert.equal((await saveProductSet(command("hidden", saved.revision))).ok, true);
  assert.deepEqual(archived, [["parent", "ARCHIVED"]]);
  assert.deepEqual(sets.setExtras(products[0], products, store.sets[1]), []);
  assert.equal((await saveProductSet(command("auto", store.sets[1].revision))).ok, true);
  assert.deepEqual(store.sets, [other]);
});

test("a priced set links actual component variants and verifies the storefront price before returning a cart mapping", async t => {
  const before = process.env.SHOPIFY_BUNDLE_PUBLICATION_ID;
  process.env.SHOPIFY_BUNDLE_PUBLICATION_ID = "gid://shopify/Publication/4";
  t.after(() => {
    if (before === undefined) delete process.env.SHOPIFY_BUNDLE_PUBLICATION_ID;
    else process.env.SHOPIFY_BUNDLE_PUBLICATION_ID = before;
  });
  const variantId = "gid://shopify/ProductVariant/111";
  const components = products.map(p => p.choices[0].id);
  const steps = [];
  let draft = null;
  let reads = 0;
  let wrongPrice = false;
  const { prepareSetOffer } = load("lib/shopify/product-set-offer.ts", {
    "server-only": {}, "@/lib/product-sets": sets, "node:timers/promises": { setTimeout: async () => {} },
    "./admin-bundles": { async adminGraphQL(query, vars) {
      const operation = query.match(/(?:query|mutation) (\w+)/)[1];
      steps.push(operation);
      if (operation === "FindSet") return { productByIdentifier: draft };
      if (operation === "MakeSet") {
        draft = { id: "parent", status: "DRAFT", tags: vars.input.tags,
          variants: { nodes: [{ id: variantId, sku: vars.input.variants[0].sku }] } };
        return { productSet: { userErrors: [], product: draft } };
      }
      if (operation === "LinkSet") {
        assert.deepEqual(vars.input[0].productVariantRelationshipsToCreate, components.map(id => ({ id, quantity: 1 })));
        assert.equal(vars.input[0].priceInput.price, "80.00");
        return { productVariantRelationshipBulkUpdate: { userErrors: [] } };
      }
      if (operation === "ReadSetComponents") {
        reads++;
        return { nodes: [{ id: variantId, price: wrongPrice ? "100" : "80.00", requiresComponents: reads > 1,
          productVariantComponents: { pageInfo: { hasNextPage: false },
            nodes: components.map(id => ({ quantity: 1, productVariant: { id } })).reverse() } }] };
      }
      if (operation === "SetStatus") return { productUpdate: { userErrors: [] } };
      if (operation === "PublishSet") return { publishablePublish: { userErrors: [] } };
      assert.fail(operation);
    } },
    "./client": { storefront: async () => ({ nodes: [{ id: variantId, price: { amount: "80", currencyCode: "ILS" } }] }) },
  });
  const offer = await prepareSetOffer(products, 80, () => {});
  assert.deepEqual(steps, ["FindSet", "MakeSet", "LinkSet", "ReadSetComponents", "ReadSetComponents", "SetStatus", "PublishSet"]);
  assert.deepEqual(offer.variants, [{ id: variantId, components }]);
  steps.length = 0;
  assert.deepEqual(await prepareSetOffer(products, 80, () => {}), offer);
  assert.deepEqual(steps, ["FindSet", "ReadSetComponents", "SetStatus", "PublishSet"]);
  steps.length = 0;
  wrongPrice = true;
  await assert.rejects(prepareSetOffer(products, 80, () => assert.fail("Unexpected publication")), /0 מתוך 1/);
  assert.ok(!steps.includes("PublishSet") && !steps.includes("LinkSet"));
});

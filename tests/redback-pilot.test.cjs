const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../lib/suppliers/redback.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exportsForTest = {};
new Function("require", "exports", code)((id) => (id === "server-only" ? {} : require(id)), exportsForTest);
const { parseRedback } = exportsForTest;
const image = "https://redback.co.il/wp-content/uploads/test.jpg";
const sizes = ["small", "medium"];
const rows = sizes.map((size, i) => ({
  variation_id: 100 + i,
  sku: "shared",
  attributes: { attribute_pa_size: size },
  is_in_stock: i === 0,
  display_price: 80,
  display_regular_price: 199,
  image: { full_src: image },
}));
function page(variants) {
  return `<h1>MACKENZIE</h1><span><a>בית</a><a>פליז</a><span class="breadcrumb_last">מוצר</span></span>
    <div class="info-container"><div class="accordion-body"><p>פרטי המוצר</p></div></div>
    <div class="woocommerce-product-gallery"><img data-large_image="${image}"><img data-large_image="${image}"></div>
    <form class="variations_form" data-product_id="39468" data-product_variations='${JSON.stringify(variants)}'>
    <table><tr><td><label>Size</label><select name="attribute_pa_size">
    <option value="small">S</option><option value="medium">M</option></select></td></tr></table></form>`;
}
test("Redback keeps separately identified variants with a shared SKU, and deduplicates source images", () => {
  const product = parseRedback(page(rows), "39468");
  assert.deepEqual(product.images, [image]);
  assert.deepEqual(
    product.variants.map((v) => [v.id, v.options["מידה"], v.available]),
    [
      ["100", "S", true],
      ["101", "M", false],
    ],
  );
  assert.deepEqual(product.description, ["פרטי המוצר"]);
});
test("incomplete availability, duplicate combinations and foreign media fail the scan", () => {
  for (const variants of [
    [{ ...rows[0], is_in_stock: null }],
    [rows[0], { ...rows[0], variation_id: 105 }],
    [{ ...rows[0], image: { full_src: "https://example.org/file.png" } }],
  ]) {
    assert.throws(() => parseRedback(page(variants), "39468"));
  }
});

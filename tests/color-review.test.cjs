const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const ts = require("typescript");

function load(file, dependencies = {}) {
  const source = readFileSync(resolve(__dirname, "..", file), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  });
  const exports = {};
  new Function("exports", "require", outputText)(exports, name => {
    assert.ok(Object.hasOwn(dependencies, name), `unexpected dependency: ${name}`);
    return dependencies[name];
  });
  return exports;
}

const colors = load("lib/colors.ts");
const families = load("lib/color-families.ts", { "./colors": colors });
const review = load("lib/admin/color-review.ts", { "../colors": colors, "../color-families": families });
const palette = load("lib/admin/color-photo.ts", { "server-only": {}, "next/cache": { unstable_cache: fn => fn },
  sharp: require("sharp"), "../image-sources": load("lib/image-sources.ts") });

const products = [
  { id: "one", name: "First", colors: ["Supplier 51", "navy"], imgs: ["/generic.png"],
    choices: [{ color: "Supplier 51", image: "/shared.png" }, { color: "NAVY", image: "/shared.png" }] },
  { id: "two", name: "Second", colors: ["SUPPLIER 51", "Charcoal P13"], imgs: ["/second.png"],
    choices: [{ color: "SUPPLIER 51", image: "/variant.png" }, { color: "Supplier 51", image: "/variant.png" }, { color: "Charcoal P13" }] },
];

test("the review groups spelling variants by distinct products and prefers a photo unique to a color", () => {
  const items = review.catalogColorReview(products);
  assert.deepEqual(items.map(row => [row.key, row.count]), [["supplier 51", 2], ["charcoal p13", 1]]);
  assert.deepEqual(items[0].example, { id: "two", name: "Second", image: "/variant.png", variant: true });
  assert.deepEqual(items[1].example, { id: "two", name: "Second", image: "/second.png", variant: false });
  assert.deepEqual(review.suggestColorFromName("Charcoal P13"), { family: "gray", swatch: "#3C3F42", source: "name" });
  assert.equal(review.suggestColorFromName("Supplier 51"), undefined);
  assert.equal(review.suggestColorFromName("ירוק אפור 71"), undefined);
});

test("a variant photo yields a color from the product area on a pale background", () => {
  const width = 12, height = 12;
  const data = new Uint8Array(width * height * 4).fill(255);
  for (let y = 3; y < 9; y++) for (let x = 3; x < 9; x++) data.set([47, 80, 62, 255], (y * width + x) * 4);
  assert.deepEqual(palette.colorFromPixels(data, width, height), { family: "green", swatch: "#2f503e", source: "photo" });
  data.fill(255);
  assert.equal(palette.colorFromPixels(data, width, height), undefined);
});

test("approval and reset affect the display and family filter while keeping the catalog shade available", async () => {
  const store = {};
  const { saveColorMapping } = load("lib/admin/color-mappings.ts", {
    "server-only": {}, "../colors": colors, "../color-families": families, "../shopify/load-catalog": {
      loadShopCatalog: async () => ({ products }),
    }, "./color-review": review,
    "./storage": { changeAdminStore: async change => change(store), AdminEditBusy: class extends Error {} },
  });
  const save = async (id, operation, extra = {}) => {
    const form = new FormData();
    for (const [key, value] of Object.entries({ id, operation, ...extra })) form.set(key, value);
    return saveColorMapping(form);
  };
  assert.equal((await save("supplier 51", "save", { family: "green", swatch: "url(x)" })).ok, false);
  assert.equal((await save("unknown", "save", { family: "green", swatch: "#486640" })).ok, false);
  assert.equal((await save("supplier 51", "save", { family: "green", swatch: "#486640" })).ok, true);
  assert.equal(colors.swatchColor("SUPPLIER 51", store.colorMappings), "#486640");
  assert.equal(families.categoryColorMatcher(["family:green"], store.colorMappings)(products[1].colors), true);
  assert.ok(review.catalogColorReview(products, store.colorMappings)[0].approved);
  assert.equal(products[1].choices[0].color, "SUPPLIER 51");
  assert.equal((await save("supplier 51", "reset")).ok, true);
  assert.equal(families.familyForColor("SUPPLIER 51", store.colorMappings), undefined);
});

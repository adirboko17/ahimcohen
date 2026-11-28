const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { transpileModule, ModuleKind, ScriptTarget } = require("typescript");

function load(file) {
  const compiled = transpileModule(readFileSync(resolve(__dirname, "../lib/" + file + ".ts"), "utf8"), {
    compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  new Function("exports", "module", compiled)(loaded.exports, loaded);
  return loaded.exports;
}
const { imageSources } = load("image-sources");
const { packCatalog, unpackCatalog } = load("catalog-wire");

test("responsive CDN images retain version and aspect ratio without rewriting other hosts", () => {
  const src = "https://cdn.shopify.com/s/files/1/test/files/boot.jpg?v=123&width=2000&height=2000";
  const result = imageSources(src, 640);
  assert.equal(new URL(result.src).searchParams.get("v"), "123");
  assert.equal(new URL(result.src).searchParams.get("width"), "640");
  assert.equal(new URL(result.src).searchParams.has("height"), false);
  assert.match(result.srcSet, /width=320 320w/);
  assert.doesNotMatch(result.srcSet, /960w/);
  for (const url of ["/images/category.webp", "https://example.com/a.jpg", src + "&signature=keep-me"]) {
    assert.deepEqual(imageSources(url), { src: url });
  }
  assert.deepEqual(imageSources(undefined), { src: undefined });
});

test("compact catalog round-trip preserves selections, availability, prices and optional data", () => {
  const image = "https://cdn.shopify.com/s/files/1/test/files/very-long-product-photo-name.jpg?v=123456789";
  const catalog = {
    categories: [{ id: "shoes", name: "נעלי בטיחות", subs: ["מגפיים"], image }],
    products: [{ id: "boots", name: "נעליים", cat: "shoes", sub: "מגפיים", price: 0, colors: ["שחור", ""], sizes: ["40", "41"], imgs: [image], desc: ["תיאור"], deal: [2, 99],
      choices: Array.from({ length: 80 }, (_, i) => ({ id: `gid://shopify/ProductVariant/${i}`, color: i % 2 ? "שחור" : "", size: String(40 + i), price: i + 0.5, available: i % 2 === 0, image, sku: i ? `sku-${i}` : "" })) },
      { id: "plain", name: "ללא תמונה", cat: "shoes", sub: "", price: 12, colors: [], sizes: [], choices: [
        { id: "one", color: "", size: "", price: 0, available: false },
        { id: "two", color: "", size: "", price: 12, available: true, optionsLabel: "חומר אלומיניום", sourceVariantId: "source" },
      ] },
      { id: "empty", name: "ריק", cat: "shoes", sub: "", price: 0, colors: [], sizes: [], imgs: [], choices: [] },
    ],
  };
  const original = JSON.stringify(catalog);
  const packed = packCatalog(catalog);
  const transferred = JSON.parse(JSON.stringify(packed));
  assert.deepEqual(unpackCatalog(transferred), catalog);
  assert.equal(JSON.stringify(catalog), original, "packing must not mutate cached catalog");
  assert.equal(packed.strings.filter((s) => s === image).length, 1);
  assert.ok(Buffer.byteLength(JSON.stringify(packed)) < Buffer.byteLength(original) * 0.65);
  assert.deepEqual(unpackCatalog(packCatalog({ categories: [], products: [] })), { categories: [], products: [] });
});

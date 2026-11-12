const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { transpileModule, ModuleKind, ScriptTarget } = require("typescript");

const compiled = transpileModule(readFileSync(resolve(__dirname, "../lib/sizes.ts"), "utf8"), {
  compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
}).outputText;
const loaded = { exports: {} };
new Function("exports", "module", compiled)(loaded.exports, loaded);
const { sizeLabel, uniqueSizes, matchesSizeFilter, productSizeOptions } = loaded.exports;

test("letter sizes sort by fit and duplicate notations share a filter", () => {
  assert.deepEqual(uniqueSizes(["8XL", "XXL", "M", "XS", "2XL", "L", "S", "XL", "3XL", "xxxl", "XXS", "2XS", "4XL"]),
    ["2XS", "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "8XL"]);
  assert.equal(sizeLabel("\u200f 2 xl \u200e"), "2XL");
  assert.equal(sizeLabel("%58%58%4c"), "2XL");
});

test("numeric sizes and half sizes sort numerically, retaining manufacturer annotations", () => {
  assert.deepEqual(uniqueSizes(["100", "42.5", "9.5", "9", "10", "(xs) 28", "30", "42", "(4xl גדול!) 42", "35-39", "39 - 43"]),
    ["9", "9.5", "10", "(xs) 28", "30", "35-39", "39-43", "(4xl גדול!) 42", "42", "42.5", "100"]);
});

test("combined sizes deduplicate without merging them with single sizes", () => {
  assert.deepEqual(uniqueSizes(["LXL", "ML", "L/XL", "M/L", "S / M", "L", "M", "2XL/3XL", "XXL/XXXL"]),
    ["S/M", "M", "M/L", "L", "L/XL", "2XL/3XL"]);
  assert.equal(matchesSizeFilter(["LXL"], ["L/XL"]), true);
  assert.equal(matchesSizeFilter(["L/XL"], ["L"]), false);
});

test("aliases match in either direction, including restored filters, without widening sizes", () => {
  assert.equal(matchesSizeFilter(["XXL"], ["2XL"]), true);
  assert.equal(matchesSizeFilter(["2XL"], ["XXL"]), true);
  assert.equal(matchesSizeFilter(["XL", "3XL"], ["XXL"]), false);
  assert.equal(matchesSizeFilter(["(4xl גדול!) 42"], ["4XL"]), false);
  assert.equal(matchesSizeFilter(["S - 97 ס\"מ"], ["S"]), false);
  assert.equal(matchesSizeFilter([], []), true);
  assert.equal(matchesSizeFilter([], ["M"]), false);
});

test("one-size aliases collapse, placeholders disappear, and original variants are untouched", () => {
  const raw = Object.freeze(["OS", "מידה אחת", "One Size", "Default Title", "מידה", "XXL", "2XL", "au-6-eu-40", "S - 97 ס\"מ"]);
  const before = [...raw];
  assert.deepEqual(uniqueSizes(raw), ["S - 97 ס\"מ", "2XL", "au-6-eu-40", "מידה אחת"]);
  assert.equal(matchesSizeFilter(raw, ["מידה אחת"]), true);
  assert.equal(matchesSizeFilter(["Default Title"], ["מידה אחת"]), false);
  assert.deepEqual(raw, before);
  for (const label of raw) assert.equal(sizeLabel(sizeLabel(label)), sizeLabel(label));
});

test("product options sort and deduplicate while resolving original sizes for the selected color", () => {
  const product = {
    sizes: ["XXL", "M", "2XL", "S"], colors: ["blue", "black"],
    choices: [
      { id: "blue-xxl", size: "XXL", color: "blue", available: true },
      { id: "black-2xl", size: "2XL", color: "black", available: true },
      { id: "blue-m", size: "M", color: "blue", available: true },
      { id: "black-s", size: "S", color: "black", available: true },
    ],
  };
  const before = JSON.stringify(product);
  assert.deepEqual(productSizeOptions(product).map(option => option.label), ["S", "M", "2XL"]);
  for (const [color, rawSize, id] of [["blue", "XXL", "blue-xxl"], ["black", "2XL", "black-2xl"]]) {
    const option = productSizeOptions(product, color).find(option => option.label === "2XL");
    assert.equal(option.value, rawSize);
    assert.equal(option.available, true);
    assert.equal(product.choices.find(choice => choice.color === color && choice.size === option.value).id, id);
  }
  assert.equal(productSizeOptions(product, "black").find(option => option.label === "M").available, false);
  assert.equal(JSON.stringify(product), before);
});

test("an available alias is preferred over its sold-out duplicate without falling back to another size or color", () => {
  const product = {
    sizes: ["XXL", "2XL", "XL"], colors: ["blue", "black"],
    choices: [
      { size: "XXL", color: "blue", available: false },
      { size: "2XL", color: "blue", available: true },
      { size: "XL", color: "black", available: true },
    ],
  };
  assert.deepEqual(productSizeOptions(product, "blue"), [
    { label: "XL", value: "", available: false },
    { label: "2XL", value: "2XL", available: true },
  ]);
  product.choices[1].available = false;
  assert.equal(productSizeOptions(product, "blue").find(option => option.label === "2XL").available, false);
});

test("single-size products and catalogs without variant metadata retain their original cart values", () => {
  assert.deepEqual(productSizeOptions({ sizes: ["XXL", "2XL"], colors: [] }), [
    { label: "2XL", value: "XXL", available: true },
  ]);
  for (const raw of ["OS", "Default Title", "מידה אחת"]) {
    assert.deepEqual(productSizeOptions({ sizes: [raw], colors: [], choices: [{ size: raw, color: "", available: true }] }), [
      { label: "מידה אחת", value: raw, available: true },
    ]);
  }
});

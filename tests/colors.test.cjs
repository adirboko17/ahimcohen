const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { transpileModule, ModuleKind, ScriptTarget } = require("typescript");

const compiled = transpileModule(readFileSync(resolve(__dirname, "../lib/colors.ts"), "utf8"), {
  compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
}).outputText;
const loaded = { exports: {} };
new Function("exports", "module", compiled)(loaded.exports, loaded);
const { swatchColor, resolveSwatch, colorLabel, uniqueColors, matchesColorFilter, UNKNOWN_SWATCH } = loaded.exports;

test("Hebrew abbreviations and English labels resolve to the intended color", () => {
  for (const [label, expected] of [
    ["אפ עכבר", "#8A8B8D"], ["ירוק בק", "#1E4D3A"], ["תכלת", "#8DC6E8"],
    ["חאקי", "#B4A17A"], ["בורדו", "#75283F"], ["  BLACK  ", "#1A1A1A"],
    ["Navy", "#1F2A44"], ["dark green", "#2F4A36"], ["beige", "#D8C8A8"],
    ["צ׳רקול", "#3C3F42"], ["\u200fלבן\u200e", "#FFFFFF"],
  ]) assert.equal(swatchColor(label), expected, label);
});

test("encoded variant labels display legibly without changing the stored value", () => {
  const label = "%d7%a9%d7%97%d7%95%d7%a8";
  assert.equal(colorLabel(label), "שחור");
  assert.equal(swatchColor(label), "#1A1A1A");
  assert.equal(swatchColor(encodeURIComponent("שחור-מלאנג")), swatchColor("שחור מלאנג׳"));
});

test("combination colors show every named color, and fabric patterns remain patterns", () => {
  assert.equal(swatchColor("אפור / כחול"), "linear-gradient(135deg, #8A8B8D 0% 50%, #2F5597 50% 100%)");
  const triple = swatchColor("שחור/לבן/אפור");
  for (const hex of ["#1A1A1A", "#FFFFFF", "#8A8B8D"]) assert.ok(triple.includes(hex));
  assert.match(swatchColor("פסים כחול לבן"), /repeating-linear-gradient/);
  assert.match(swatchColor("משבצות"), /repeating-conic-gradient/);
});

test("unrecognized or malformed labels never produce an arbitrary color", () => {
  for (const value of ["", "unknown finish", "%E0%A4%A", "כחול / לא ידוע", "constructor", "__proto__"]) {
    assert.equal(resolveSwatch(value), null);
    assert.equal(swatchColor(value), UNKNOWN_SWATCH);
  }
});

test("every color name in the audited live catalog is explicitly supported", () => {
  const audit = JSON.parse(readFileSync(resolve(__dirname, "../assets/color-catalog-audit.json"), "utf8").replace(/^\uFEFF/, ""));
  const labels = [...new Set(audit.map(row => row.color))];
  assert.ok(labels.length > 60, "The audit must include the full catalog, not a single page");
  assert.deepEqual(labels.filter(label => resolveSwatch(label) === null), []);
});

test("English aliases and Hebrew abbreviations have one Hebrew display name", () => {
  for (const [input, expected] of [
    ["Blue", "כחול"], ["  BLACK ", "שחור"], ["dark green", "ירוק כהה"],
    ["Navy", "כחול כהה"], ["נייבי", "כחול כהה"], ["LIGHT NAVY", "נייבי בהיר"],
    ["yellow stone", "צהוב אבן"], ["אפ עכבר", "אפור"], ["ירוק בק", "ירוק בקבוק"],
    ["אפור / Navy", "אפור / כחול כהה"], ["White + Black", "לבן / שחור"],
  ]) assert.equal(colorLabel(input), expected);
});

test("duplicate aliases collapse while distinct shades and patterns remain separate", () => {
  assert.deepEqual(uniqueColors(["blue", "כחול", "BLUE", "Navy", "נייבי", "כחול כהה", "תכלת", "LIGHT NAVY"]), ["כחול", "כחול כהה", "תכלת", "נייבי בהיר"]);
  assert.deepEqual(uniqueColors(["אפור", "אפור עכבר", "Gray", "אפור כהה", "מלאנז'", "grey melange"]), ["אפור", "אפור כהה", "אפור מלאנז'"]);
  assert.deepEqual(uniqueColors(["blue / gray", "אפור / כחול", "כחול"]), ["כחול / אפור", "כחול"]);
  assert.deepEqual(uniqueColors(["unknown finish", "another finish"]), ["unknown finish", "another finish"]);
});

test("one Hebrew filter matches both languages and encoded colors without widening shades", () => {
  assert.equal(matchesColorFilter(["Blue"], ["כחול"]), true);
  assert.equal(matchesColorFilter(["כחול"], ["blue"]), true);
  assert.equal(matchesColorFilter(["Navy"], ["כחול"]), false);
  assert.equal(matchesColorFilter(["תכלת"], ["כחול"]), false);
  assert.equal(matchesColorFilter([encodeURIComponent("נייבי")], ["כחול כהה"]), true);
  assert.equal(matchesColorFilter(["gray / blue"], ["כחול / אפור"]), true);
  assert.equal(matchesColorFilter([], []), true);
  assert.equal(matchesColorFilter([], ["כחול"]), false);
});

test("display and filter normalization leave Shopify variant values unchanged", () => {
  const rawColors = Object.freeze(["Blue", "כחול", "%d7%a9%d7%97%d7%95%d7%a8"]);
  const before = [...rawColors];
  uniqueColors(rawColors);
  rawColors.forEach(colorLabel);
  matchesColorFilter(rawColors, ["כחול"]);
  assert.deepEqual(rawColors, before);
});

test("every audited catalog color displays in Hebrew and preserves its swatch", () => {
  const audit = JSON.parse(readFileSync(resolve(__dirname, "../assets/color-catalog-audit.json"), "utf8").replace(/^\uFEFF/, ""));
  const labels = [...new Set(audit.map(row => row.color))];
  assert.deepEqual(labels.filter(label => /[a-z]/i.test(colorLabel(label))), []);
  assert.ok(uniqueColors(labels).length < labels.length);
  for (const label of labels) assert.equal(swatchColor(colorLabel(label)), swatchColor(label), label);
});

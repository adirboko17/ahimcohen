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
const { swatchColor, resolveSwatch, colorLabel, UNKNOWN_SWATCH } = loaded.exports;

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

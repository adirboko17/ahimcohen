const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { transpileModule, ModuleKind, ScriptTarget } = require("typescript");

const source = transpileModule(readFileSync(resolve(__dirname, "../lib/quantity-offers.ts"), "utf8"), {
  compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
}).outputText;
const loaded = { exports: {} };
new Function("exports", "module", source)(loaded.exports, loaded);
const { isQuantityOffer, quantityOffer, offerCartQuantity } = loaded.exports;
const product = (name, extra = {}) => ({ id: "product", name, price: 100, ...extra });

test("offer entry selects the qualifying quantity, but only one complete pack", () => {
  assert.equal(offerCartQuantity(product("חולצת אוברסייז - 2 חולצות ב-140 ש״ח", { price: 89 })), 2);
  assert.equal(offerCartQuantity(product("חולצה", { deal: [6, 100] })), 6);
  assert.equal(offerCartQuantity(product("מבצע כפפות עבודה – 240 זוגות ב-479 ₪ בלבד!", { price: 479 })), 1);
  assert.equal(offerCartQuantity(product("מארז שתי חולצות בייסיק", { price: 99, was: 119 })), 1);
  assert.equal(offerCartQuantity(product("מוצר רגיל")), 1);
});

test("structured quantity offers require multiple units and a real discount", () => {
  assert.equal(isQuantityOffer(product("חולצה", { deal: [3, 250] })), true);
  for (const deal of [[1, 90], [0, 90], [2.5, 100], [3, 300], [3, 400], [3, -5], [3, NaN]]) {
    assert.equal(isQuantityOffer(product("חולצה", { deal })), false);
  }
});

test("live catalog titles with explicit quantity prices are included even without a deal field", () => {
  for (const name of [
    "חולצת אוברסייז - 2 חולצות ב-140 ש״ח",
    'מכנסי דגמ"ח AUSTRALIAN בגזרה צרה - מבצע שני דגמ"חים ב-298 ש"ח',
    'מכנסי דגמ"ח אקסטרים בגזרת Slim - מבצע שני דגמ"חים ב-298 ש"ח',
    "מבצע כפפות עבודה – 240 זוגות ב-479 ₪ בלבד!",
    "מבצע כפפות עבודה – 240 זוגות ב-439 ₪ בלבד!",
    "חולצות: 6 ב־100 ₪",
  ]) assert.equal(isQuantityOffer(product(name)), true, name);
});

test("discounted multipacks are included but ordinary packaging and single-item sales are excluded", () => {
  for (const name of ["מארז שתי חולצות בייסיק", "מארז 2 חולצות טריקו", "גרביים (3 זוגות)"]) {
    assert.equal(isQuantityOffer(product(name, { was: 119 })), true, name);
  }
  for (const name of ["חולצת עבודה", "מארז יחיד", "מארז 1 חולצה", "חולצה אחת ב-90 ₪", "חולצה 1 ב-90 ₪"]) {
    assert.equal(isQuantityOffer(product(name, { was: 119 })), false, name);
  }
  for (const name of ["אטמי אוזניים בקופסה – 200 זוגות", "שמלה חד פעמית 1000 יח׳ במארז", "מארז 2 חולצות", "מכנסי עבודה 2 כיסים"]) {
    assert.equal(isQuantityOffer(product(name)), false, name);
  }
});

test("classifying a promotion never changes the product price or turns a bulk pack into a cart quantity deal", () => {
  const pack = Object.freeze(product("מבצע כפפות עבודה – 240 זוגות ב-439 ₪ בלבד!", { price: 439 }));
  const before = JSON.stringify(pack);
  assert.equal(isQuantityOffer(pack), true);
  assert.equal(JSON.stringify(pack), before);
  assert.equal(pack.deal, undefined);
});

test("shirt and pants multi-buy prices show the total, per-unit price and comparable saving", () => {
  const shirt = quantityOffer(product("חולצת אוברסייז - 2 חולצות ב-140 ש״ח", { price: 89 }));
  assert.deepEqual(shirt, {
    title: "חולצת אוברסייז", quantity: 2, total: 140, unitPrice: 70, regularTotal: 178, saving: 38,
    kind: "quantity", quantityLabel: "יחידות", unitLabel: "ליחידה",
  });
  const pants = quantityOffer(product('מכנסי דגמ"ח AUSTRALIAN בגזרה צרה - מבצע שני דגמ"חים ב-298 ש"ח', { price: 179 }));
  assert.equal(pants.quantity, 2);
  assert.equal(pants.total, 298);
  assert.equal(pants.unitPrice, 149);
  assert.equal(pants.regularTotal, 358);
  assert.equal(pants.saving, 60);
  assert.equal(pants.title, 'מכנסי דגמ"ח AUSTRALIAN בגזרה צרה');
});

test("pack prices and comparison prices are never multiplied by pack size", () => {
  const shirts = quantityOffer(product("מארז שתי חולצות בייסיק", { price: 99, was: 119 }));
  assert.equal(shirts.kind, "pack");
  assert.equal(shirts.total, 99);
  assert.equal(shirts.unitPrice, 49.5);
  assert.equal(shirts.regularTotal, 119);
  assert.equal(shirts.saving, 20);
  for (const price of [439, 479]) {
    const gloves = quantityOffer(product(`מבצע כפפות עבודה – 240 זוגות ב-${price} ₪ בלבד!`, { price }));
    assert.equal(gloves.kind, "pack");
    assert.equal(gloves.quantity, 240);
    assert.equal(gloves.quantityLabel, "זוגות");
    assert.equal(gloves.unitLabel, "לזוג");
    assert.equal(gloves.total, price);
    assert.equal(gloves.unitPrice, price / 240);
    assert.equal(gloves.regularTotal, null);
    assert.equal(gloves.saving, 0);
  }
});

test("structured deals, decimal totals and thousands separators retain their actual quantities and prices", () => {
  const structured = quantityOffer(product("חולצה", { price: 29, deal: [6, 100] }));
  assert.equal(structured.total, 100);
  assert.equal(structured.unitPrice, 100 / 6);
  assert.equal(structured.regularTotal, 174);
  assert.equal(structured.saving, 74);
  assert.equal(quantityOffer(product("חולצות 2 ב-59.90 ₪")).total, 59.9);
  assert.equal(quantityOffer(product("חולצות 2 ב-59,90 ₪")).total, 59.9);
  assert.equal(quantityOffer(product("חולצות 20 ב-1,200 ₪")).total, 1200);
  assert.equal(quantityOffer(product("מארז 2 חולצות ב-0 ₪")), null);
});

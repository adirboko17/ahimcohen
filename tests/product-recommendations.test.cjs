const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const ts = require("typescript");

const compiled = ts.transpileModule(readFileSync(resolve(__dirname, "../lib/product-recommendations.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const loaded = { exports: {} };
new Function("exports", compiled)(loaded.exports);
const { complementaryAccessories: recommend } = loaded.exports;
const product = (id, name, cat = "shop", sub = "", extra = {}) => ({ id, name, cat, sub, price: 100, sizes: ["M"], colors: [], ...extra });
const ids = (items) => items.map((item) => item.id);
const belt = product("belt", "חגורת עור", "redback", "חגורות", { brand: "REDBACK" });
const sock = product("sock", "PRO-SPORT", "redback", "גרביים");
const insole = product("insole", "רפידה דגם אביב", "shoes", "אביזרי הנעלה ורפידות");
const cap = product("cap", "כובע מצחייה", "acc", "כובעים");

test("pants get wearable belts, never other pants, socks, or safety belts", () => {
  const pants = product("pants", "PERTH – nylon", "pro", "מכנסיים", { brand: "REDBACK" });
  const harness = product("harness", "חגורת בטיחות", "safety", "ציוד לעבודה בגובה");
  const weaponBelt = product("weapon", "חגורת נשק מקצועית עור", "rep", "אקססוריז");
  const reflectiveBelt = product("reflective", "חגורת גומי זוהרת", "pro", "אפודים זוהרים");
  const otherBelt = product("a-other", "חגורת ניילון", "acc", "", { brand: "Other" });
  assert.deepEqual(ids(recommend(pants, [pants, sock, cap, harness, weaponBelt, reflectiveBelt, otherBelt, belt])), ["belt", "a-other"]);
});

test("shoe recommendations mix insoles and socks and exclude model-specific parts", () => {
  const boot = product("boot", "מגף ניטריל עם רפידה", "shoes", "מגפי עבודה ובטיחות");
  const modelPart = product("part", "מדרס סופר בירקי", "shoes", "אביזרי הנעלה ורפידות");
  assert.deepEqual(ids(recommend(boot, [boot, belt, modelPart, sock, insole])), ["insole", "sock"]);
});

test("winter coats get winter accessories, not another coat whose name mentions a hat", () => {
  const coat = product("coat", "מעיל סופטשל עם כובע", "winter", "מעילים");
  const beanie = product("beanie", "כובע צמר", "acc", "כובעים");
  const warmer = product("warmer", "חם צוואר פליז", "acc", "אביזרים נלווים");
  assert.deepEqual(ids(recommend(coat, [coat, cap, sock, beanie, warmer])), ["beanie", "warmer"]);
});

test("chef clothing gets chef hats and kitchen aprons, not gardening aprons", () => {
  const chef = product("chef", "ג'קט שף", "kitchen", "ג'קט שף");
  const hat = product("chef-hat", "כובע שף", "kitchen", "כובעי שף");
  const apron = product("apron", "סינר שלם", "kitchen", "סינרים");
  const garden = product("garden", "סינר לקטיף", "acc", "אביזרים נלווים");
  assert.deepEqual(ids(recommend(chef, [garden, apron, hat, cap, belt])), ["chef-hat", "apron"]);
});

test("formal shirts get ties; work shirts get casual caps", () => {
  const formal = product("formal", "חולצת אוקספורד", "rep", "חולצות ייצוגיות");
  const work = product("work", "חולצת דרייפיט", "pro", "חולצות");
  const tie = product("tie", "עניבה", "rep", "אקססוריז");
  assert.deepEqual(ids(recommend(formal, [tie, belt, cap])), ["tie"]);
  assert.deepEqual(ids(recommend(work, [tie, belt, cap])), ["cap"]);
});

test("no suitable accessories means an empty list, including unsupported products", () => {
  const pants = product("pants", "מכנסי עבודה", "pro", "מכנסיים");
  const leggings = product("leggings", "UTILITY LEGGING", "pro", "מכנסיים");
  const unknown = product("unknown", "מחשבון");
  assert.deepEqual(recommend(pants, [sock, cap]), []);
  assert.deepEqual(recommend(leggings, [belt]), []);
  assert.deepEqual(recommend(unknown, [belt, cap, sock]), []);
  assert.deepEqual(recommend(belt, [belt, cap, sock]), []);
});

test("secondary category memberships work; unavailable products and duplicate IDs are excluded", () => {
  const boot = product("boot", "מגף", "redback", "", { cats: ["redback", "shoes"] });
  const soldOut = { ...insole, choices: [{ available: false }] };
  assert.deepEqual(ids(recommend(boot, [boot, soldOut, sock, sock])), ["sock"]);
  assert.deepEqual(recommend(boot, [sock], 0), []);
  assert.equal(recommend(boot, [insole, sock], 1).length, 1);
});

test("duplicate listings of the same named accessory and brand appear only once", () => {
  const pants = product("pants", "PERTH", "pro", "מכנסיים");
  const duplicateBelt = { ...belt, id: "belt-copy", brand: "redback.co.il" };
  assert.deepEqual(ids(recommend(pants, [belt, duplicateBelt])), ["belt"]);
});

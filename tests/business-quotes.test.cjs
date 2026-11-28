const { test } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { readFileSync } = require("node:fs");
const ts = require("typescript");

function load(path, dependencies = {}) {
  const js = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function("require", "exports", js)(id => dependencies[id] ?? require(id), exports);
  return exports;
}

function setup() {
  const writes = new Map();
  const storage = { adminRequest: async (path, { body }) => { writes.set(path, body); } };
  const product = { id: "shirt", sku: "115-6", name: "חולצה", colors: ["לבן"], sizes: ["S", "XL"] };
  const repo = load("lib/admin/business-quotes.ts", {
    "server-only": {}, "./database": storage, "@/lib/business-quotes": load("lib/business-quotes.ts"),
    "@/lib/catalog": { colorLabel: value => value }, "@/lib/sizes": load("lib/sizes.ts"),
    "@/lib/shopify/config": { shopDomain: () => "test.invalid" },
    "@/lib/shopify/load-catalog": { loadShopCatalog: async () => ({ products: [product] }) },
  });
  const input = {
    contact: { org: "עסק", name: "איש קשר", phone: "0123456789", email: "", notes: "" },
    branding: ["הדפס כיס", "הדפס גב"],
    items: [{ pid: "shirt", sku: "115", color: "לבן", sizes: { S: 2, XL: 3 } }],
  };
  const nonce = randomUUID();
  function form(logo) {
    const form = new FormData();
    form.set("quote", JSON.stringify(input));
    form.set("submission", nonce);
    if (logo) form.set("logo", logo);
    return form;
  }
  return { repo, writes, storage, input, form };
}

test("business quotes preserve size quantities, SKU aliases, both placements and the original logo across retries", async () => {
  const { repo, writes, input, form } = setup();
  const logo = new File(["artwork"], "לוגו.ai");
  const id = await repo.submitBusinessQuote(form(logo));
  assert.equal(await repo.submitBusinessQuote(form(logo)), id);
  assert.equal(writes.size, 2);
  const [bytes, text] = writes.values();
  assert.equal(Buffer.from(bytes).toString(), "artwork");
  assert.deepEqual(JSON.parse(text), { ...input, items: [{ ...input.items[0], name: "חולצה" }], logoName: logo.name });
});

test("no-branding and print-without-logo quotes can be fulfilled without a file", async () => {
  for (const brand of ["ללא מיתוג", "הדפס גב"]) {
    const { repo, writes, input, form } = setup();
    input.branding = [brand];
    await repo.submitBusinessQuote(form());
    assert.equal(writes.size, 1);
    const saved = JSON.parse([...writes.values()][0]);
    assert.deepEqual(saved.branding, [brand]);
    assert.equal(saved.logoName, "");
  }
});

test("invalid quantities, unavailable variants, missing contacts and conflicting branding are rejected before storage", async () => {
  for (const change of [
    q => { q.items[0].sizes.S = -1; }, q => { q.items[0].sizes.S = 1.5; },
    q => { q.items[0].sizes = {}; }, q => { q.items[0].sizes = { XXS: 4 }; },
    q => { q.items[0].pid = "unknown"; }, q => { q.contact.org = " "; },
    q => { q.branding = []; }, q => { q.branding.push("ללא מיתוג"); },
  ]) {
    const { repo, writes, input, form } = setup();
    change(input);
    await assert.rejects(repo.submitBusinessQuote(form()), repo.InvalidQuote);
    assert.equal(writes.size, 0);
  }
});

test("a failed attachment upload never publishes an incomplete quote", async () => {
  const { repo, storage, form } = setup();
  const attempted = [];
  storage.adminRequest = async path => { attempted.push(path); throw new Error("Upload interrupted"); };
  await assert.rejects(repo.submitBusinessQuote(form(new File(["art"], "logo.svg"))), /Upload interrupted/);
  assert.equal(attempted.length, 1);
  assert.match(attempted[0], /\/logos\//);
});

test("contact search paginates matching quotes across storage pages in their original order", async () => {
  const { repo, storage, input } = setup();
  const files = Array.from({ length: 35 }, (_, i) => ({ name: i.toString(16).padStart(64, "0") + ".json" }));
  storage.adminRequest = async (path, options) => {
    if (options) {
      const { offset, limit } = JSON.parse(options.body);
      return Response.json(files.slice(offset, offset + limit));
    }
    const index = files.findIndex(file => path.endsWith("/" + file.name));
    assert.notEqual(index, -1);
    const contact = { ...input.contact, org: index % 2 ? "עסק אחר" : "האחים כהן", name: "עדי " + index,
      phone: "050-123-4567", email: "Manager@Example.org" };
    return Response.json({ ...input, contact });
  };
  const first = await repo.listBusinessQuotes(1, "כהן");
  const second = await repo.listBusinessQuotes(2, "כהן");
  assert.equal(first.hasNext, true);
  assert.equal(second.hasNext, false);
  assert.deepEqual([...first.quotes, ...second.quotes].map(q => q.id + ".json"), files.filter((_, i) => i % 2 === 0).map(f => f.name));
  for (const query of ["0501234567", "(050) 123 4567", "MANAGER@example"]) {
    assert.equal((await repo.listBusinessQuotes(1, query)).quotes.length, 15);
  }
  assert.equal((await repo.listBusinessQuotes(1, "עדי 34")).quotes.length, 1);
  assert.deepEqual(await repo.listBusinessQuotes(1, "חברה אחרת"), { quotes: [], hasNext: false });
});

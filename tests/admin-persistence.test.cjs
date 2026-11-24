const assert = require("node:assert/strict");
const { randomUUID, randomBytes, scryptSync } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { test } = require("node:test");
const ts = require("typescript");

function load(name, dependencies = {}) {
  const source = readFileSync(resolve(__dirname, "../lib/admin/" + name + ".ts"), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  });
  const module = { exports: {} };
  const resolveModule = (id) => id === "server-only" ? {} : dependencies[id] ?? require(id);
  new Function("require", "module", "exports", outputText)(resolveModule, module, module.exports);
  return module.exports;
}

test("a second writer cannot run Shopify side effects under another writer's lease", async () => {
  const store = load("storage", {
    "./database": { adminRequest: async () => Response.json([]) },
    "./models": {}, "@/lib/shopify/config": { shopDomain: () => "example.invalid" },
  });
  let executed = false;
  await assert.rejects(store.changeAdminStore(() => { executed = true; }), store.AdminEditBusy);
  assert.equal(executed, false);
});

test("admin sessions, synchronized edits and banner uploads persist in Supabase", {
  skip: process.env.TEST_ADMIN_SUPABASE !== "1",
}, async (t) => {
  const shop = randomUUID() + ".invalid";
  const db = load("database");
  const deps = { "./database": db, "./models": load("models"), "@/lib/shopify/config": { shopDomain: () => shop } };
  const settings = "/rest/v1/ahim_admin_settings", accounts = "/rest/v1/ahim_admin_accounts";
  const rows = { shop_domain: "eq." + shop };
  const insert = (path, data) => db.adminRequest(path, { method: "POST", body: JSON.stringify({ shop_domain: shop, ...data }) });
  await insert(settings, {});
  t.after(() => db.adminRequest(settings, { method: "DELETE" }, rows));
  const password = randomBytes(24).toString("hex"), salt = randomBytes(16).toString("hex"), email = "admin@example.invalid";
  await insert(accounts, { email, salt, hash: scryptSync(password, Buffer.from(salt, "hex"), 64).toString("hex") });
  t.after(() => db.adminRequest(accounts, { method: "DELETE" }, rows));
  let cookie;
  const session = () => load("access", { ...deps, "next/headers": {
    headers: async () => new Headers({ "x-forwarded-proto": "https" }),
    cookies: async () => ({ set: (_name, value) => { cookie = value; }, get: () => ({ value: cookie }) }),
  } });
  assert.equal(await session().signInAdmin(email, password), "");
  assert.equal(await session().isAdmin(), true);
  await session().signOutAdmin();
  assert.equal(await session().isAdmin(), false);

  const store = load("storage", deps);
  await store.changeAdminStore(async (data) => {
    await assert.rejects(store.changeAdminStore(() => assert.fail()), store.AdminEditBusy);
    data.links.push({ id: "test", slug: "test", destination: "/brands" });
  });
  assert.equal((await load("storage", deps).readAdminStore()).links[0].destination, "/brands");
  await assert.rejects(store.changeAdminStore(() => { throw new Error("cancel"); }), /cancel/);
  await store.changeAdminStore(data => { data.links = []; });

  const images = load("hero-images", deps);
  const bytes = await require("sharp")({ create: { width: 4, height: 3, channels: 3, background: "yellow" } }).png().toBuffer();
  const result = await images.uploadHero(new File([bytes], "test.png", { type: "image/png" }));
  t.after(() => db.adminRequest("/storage/v1/object/ahim-hero-images/" + shop + "/" + result.filename, { method: "DELETE" }));
  assert.equal((await images.uploadedHero(result.filename)).src, result.src);
  const response = await fetch(images.publicHeroUrl(result.filename));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/webp");
});

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { test } = require("node:test");
const ts = require("typescript");

const compiled = ts.transpileModule(readFileSync(resolve(__dirname, "../lib/admin/commands.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const models = { exports: {} };
new Function("module", "exports", ts.transpileModule(readFileSync(resolve(__dirname, "../lib/admin/models.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(models, models.exports);
const quantityOffers = { exports: {} };
new Function("module", "exports", ts.transpileModule(readFileSync(resolve(__dirname, "../lib/quantity-offers.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(quantityOffers, quantityOffers.exports);
const mapping = { exports: {} };
new Function("require", "module", "exports", ts.transpileModule(readFileSync(resolve(__dirname, "../lib/admin/bundle-mapping.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)((name) => name === "@/lib/shopify/config" || name === "server-only" ? {} : require(name), mapping, mapping.exports);

const sourceVariant = "gid://shopify/ProductVariant/11";
const otherVariant = "gid://shopify/ProductVariant/12";

function harness(syncManagedBundle, bundles = []) {
  const store = { bundles, offers: [], hiddenQuantityOffers: [] };
  const deps = {
    "server-only": {},
    "@/lib/admin/commerce": {},
    "@/lib/admin/models": models.exports,
    "@/lib/admin/bundle-mapping": mapping.exports,
    "@/lib/quantity-offers": quantityOffers.exports,
    "@/lib/shopify/admin-bundles": { syncManagedBundle },
    "@/lib/admin/storage": {
      changeAdminStore: async (change) => {
        const copy = structuredClone(store);
        await change(copy);
        Object.assign(store, copy);
      },
      upsert: (items, item) => {
        const position = items.findIndex(({ id }) => id === item.id);
        if (position < 0) items.unshift(item);
        else items[position] = item;
      },
    },
    "@/lib/pricing": { fmt: (n) => `${n} ₪` },
    "@/lib/shopify/config": {},
    "@/lib/shopify/load-catalog": { loadShopCatalog: async () => ({ products: [{ id: "shirt", name: "חולצה", price: 49, deal: [3, 130], choices: [{ id: sourceVariant, available: true }, { id: otherVariant, available: false }] }] }) },
  };
  const module = { exports: {} };
  new Function("require", "module", "exports", compiled)((name) => deps[name] ?? require(name), module, module.exports);
  const publish = (tiers, id, variantIds = [], { bestValue, active = true, featured } = {}) => {
    const data = new FormData();
    for (const [key, value] of Object.entries({ section: "bundles", operation: "save", productId: "shirt" })) data.set(key, value);
    if (active) data.set("active", "on");
    if (id) data.set("id", id);
    if (bestValue !== undefined) data.set("bestValue", bestValue);
    for (const option of featured ?? []) data.append("showInQuantityOffers", option);
    for (const variantId of variantIds) data.append("sourceVariantId", variantId);
    for (const [title, quantity, total] of tiers) {
      data.append("title", title);
      data.append("quantity", quantity);
      data.append("total", total);
    }
    return module.exports.saveAdmin(data);
  };
  const remove = (id, section = "bundles") => {
    const data = new FormData();
    for (const [key, value] of Object.entries({ section, operation: "delete", id })) data.set(key, value);
    return module.exports.saveAdmin(data);
  };
  const saveOffer = (total, id, active = true) => {
    const data = new FormData();
    for (const [key, value] of Object.entries({ section: "offers", operation: "save", productId: "shirt", quantity: "3", total })) data.set(key, value);
    if (id) data.set("id", id);
    if (active) data.set("active", "on");
    return module.exports.saveAdmin(data);
  };
  const offerVisibility = (operation) => {
    const data = new FormData();
    for (const [key, value] of Object.entries({ section: "offers", operation, productId: "shirt" })) data.set(key, value);
    return module.exports.saveAdmin(data);
  };
  const saveGroup = (tiers, snapshot = models.exports.bundleGroupSnapshot(store.bundles)) => {
    const data = new FormData();
    for (const [key, value] of Object.entries({ section: "bundles", operation: "save-group", productId: "shirt", snapshot })) data.set(key, value);
    for (const [tierId, title, quantity, total, tierActive, showInQuantityOffers] of tiers) {
      for (const [key, value] of Object.entries({ tierId, title, quantity, total, tierActive, showInQuantityOffers })) data.append(key, value);
    }
    return module.exports.saveAdmin(data);
  };
  return { publish, remove, store, saveOffer, offerVisibility, saveGroup, saveAdmin: module.exports.saveAdmin };
}

test("the banner editor preserves legacy images, saves separate destinations and rejects removing the last image", async () => {
  const { store, saveAdmin } = harness(async () => {});
  const image = { src: "/banner.webp", width: 800, height: 400 };
  store.activeHero = "legacy";
  store.heroes = [{ id: "legacy", alt: "Original", href: "/offers", desktop: image, mobile: image }];
  assert.equal(models.exports.heroIsPublished(store.heroes[0], store.activeHero), true);
  assert.deepEqual(models.exports.heroImageTarget(store.heroes[0], "desktop"), { kind: "link", href: "/offers" });
  const submit = (fields) => {
    const form = new FormData();
    for (const [name, value] of Object.entries({ section: "heroes", operation: "save", id: "legacy", ...fields })) form.set(name, value);
    return saveAdmin(form);
  };
  const targets = { desktopTarget: "product", desktopTargetId: "shirt", mobileTarget: "none" };
  assert.equal((await submit({ ...targets, published: "on" })).ok, true);
  const banner = store.heroes[0];
  assert.equal(banner.alt, "Original");
  assert.deepEqual(banner.desktop, { ...image, target: { kind: "product", id: "shirt", label: "חולצה" } });
  assert.deepEqual(banner.mobile, { ...image, target: null });
  assert.equal((await submit({ ...targets, desktopRemove: "1", mobileRemove: "1" })).ok, false);
  assert.deepEqual(store.heroes, [banner]);
  assert.equal((await submit(targets)).ok, true);
  assert.equal(store.heroes[0].alt, "Original");
  assert.equal(models.exports.heroIsPublished(store.heroes[0], store.activeHero), false);
});

test("publishing derives all source variants from the catalog without form input", async () => {
  const synced = [];
  const { publish, store } = harness(async (base, _, tiers) => synced.push({ base, tiers }));
  const result = await publish([["Pair", "2", "70"], ["Three", "3", "99"]], undefined, [], { featured: ["no", "yes"] });
  assert.equal(result.ok, true);
  assert.equal(synced.length, 1);
  assert.equal(synced[0].base, "shirt");
  assert.deepEqual(synced[0].tiers.map(({ items, total, sourceVariantIds }) => [items[0][1], total, sourceVariantIds]),
    [[2, 70, [sourceVariant, otherVariant]], [3, 99, [sourceVariant, otherVariant]]]);
  assert.equal(store.bundles.every(({ active }) => active), true);
  assert.deepEqual(models.exports.featuredQuantityBundles(store.bundles).map(({ quantity }) => quantity), [3]);
});

test("a failed update preserves the published tier and a failed first publication keeps a draft", async () => {
  const live = { id: "live", name: "Pair", items: [["shirt", 2]], active: true, total: 98, sourceVariantIds: [sourceVariant] };
  const { publish, store } = harness(async () => { throw new Error("Shopify unavailable"); }, [live]);
  assert.equal((await publish([["Pair", "2", "95"]], live.id)).ok, false);
  assert.deepEqual(store.bundles, [live]);
  const result = await publish([["Three", "3", "140"]]);
  assert.equal(result.warning, true);
  assert.match(result.message, /Shopify unavailable/);
  assert.equal(store.bundles[0].active, false);
  assert.equal(store.bundles[0].total, 140);
});

test("editing expands a previously limited bundle and ignores submitted variant IDs", async () => {
  const prior = { id: "live", name: "Pair", items: [["shirt", 2]], active: true, total: 98, sourceVariantIds: [sourceVariant] };
  const { publish, store } = harness(async () => {}, [prior]);
  assert.equal((await publish([["Pair", "2", "95"]], prior.id, ["gid://shopify/ProductVariant/13"])).ok, true);
  assert.deepEqual(store.bundles[0].sourceVariantIds, [sourceVariant, otherVariant]);
});

test("editing can add a tier and move the best-value label to its default name", async () => {
  const pair = { id: "pair", name: "Pair", items: [["shirt", 2]], active: true, total: 98, sourceVariantIds: [sourceVariant] };
  const fourth = { ...pair, id: "fourth", items: [["shirt", 4]], bestValue: true };
  const synced = [];
  const { publish, store } = harness(async (_, __, tiers) => synced.push(tiers), [pair, fourth]);
  const result = await publish([["Pair", "2", "90"], ["", "3", "115"]], pair.id, [], { bestValue: "1" });
  assert.equal(result.ok, true);
  assert.deepEqual(synced[0].map(({ items }) => items[0][1]).sort(), [2, 3, 4]);
  assert.equal(store.bundles.find(({ id }) => id === pair.id).total, 90);
  assert.deepEqual(store.bundles.filter(({ bestValue }) => bestValue).map(({ name }) => name), ["שלישייה"]);
  assert.equal((await publish([["", "5", "180"]], undefined, [], { bestValue: "0", active: false })).ok, true);
  assert.deepEqual(store.bundles.filter(({ bestValue, active }) => bestValue && active).map(({ name }) => name), ["שלישייה"]);
});

test("removing the final tier requests archival of the generated product", async () => {
  const live = { id: "live", name: "Pair", items: [["shirt", 2]], active: true, total: 98, sourceVariantIds: [sourceVariant] };
  const synced = [];
  const { remove, store } = harness(async (base, _, tiers) => synced.push([base, tiers]), [live]);
  assert.equal((await remove(live.id)).ok, true);
  assert.deepEqual(synced, [["shirt", []]]);
  assert.deepEqual(store.bundles, []);
});

test("quantity offers publish in their own namespace, restore a failed update, and archive on removal", async () => {
  const bundle = { id: "existing", name: "Triple", items: [["shirt", 3]], active: true, total: 115, sourceVariantIds: [sourceVariant] };
  const calls = [];
  const { saveOffer, remove, store } = harness(async (id, _, tiers, kind) => {
    calls.push({ id, prices: tiers.map((tier) => tier.total), kind });
    if (tiers[0]?.total === 125) throw new Error("Shopify failure");
  }, [bundle]);
  assert.equal((await saveOffer("120")).ok, true);
  const [offer] = store.offers;
  assert.deepEqual(offer.sourceVariantIds, [sourceVariant, otherVariant]);
  assert.equal((await saveOffer("125", offer.id)).ok, false);
  assert.equal(store.offers[0].total, 120);
  assert.equal((await remove(offer.id, "offers")).ok, true);
  assert.deepEqual(calls, [120, 125, 120, undefined].map((price) => ({ id: "shirt", prices: price === undefined ? [] : [price], kind: "quantity-offer" })));
  assert.deepEqual(store.offers, []);
  assert.deepEqual(store.bundles, [bundle]);
});

test("catalog quantity offer visibility is reversible without a Shopify write", async () => {
  const { store, offerVisibility } = harness(async () => assert.fail("Unexpected Shopify sync"));
  assert.equal((await offerVisibility("hide")).ok, true);
  assert.deepEqual(store.hiddenQuantityOffers, ["shirt"]);
  assert.equal((await offerVisibility("show")).ok, true);
  assert.deepEqual(store.hiddenQuantityOffers, []);
  assert.deepEqual(store.offers, []);
});

test("the bundle dialog saves edits, additions and removals in one Shopify sync", async () => {
  const pair = { id: "pair", name: "Pair", items: [["shirt", 2]], active: true, total: 89, sourceVariantIds: [sourceVariant, otherVariant] };
  const triple = { ...pair, id: "triple", name: "Triple", items: [["shirt", 3]], total: 120 };
  const calls = [];
  const { store, saveGroup } = harness(async (_, __, tiers) => calls.push(tiers), [pair, triple]);
  const snapshot = models.exports.bundleGroupSnapshot(store.bundles);
  assert.equal((await saveGroup([["pair", "Pair", "2", "88", "yes", "yes"], ["", "", "4", "160", "yes", "no"]])).ok, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].map((tier) => [tier.name, tier.total]), [["Pair", 88], ["4 יחידות", 160]]);
  assert.equal(store.bundles[0].id, pair.id);
  assert.equal(store.bundles[0].showInQuantityOffers, true);
  assert.equal((await saveGroup([], snapshot)).ok, false);
  assert.equal(calls.length, 1);
  assert.equal((await saveGroup([])).ok, true);
  assert.deepEqual(calls[1], []);
  assert.deepEqual(store.bundles, []);
});

test("the bundle dialog preserves public tiers when synchronization fails", async () => {
  const pair = { id: "pair", name: "Pair", items: [["shirt", 2]], active: true, total: 89, sourceVariantIds: [sourceVariant, otherVariant] };
  const calls = [];
  const { store, saveGroup } = harness(async (_, __, tiers) => {
    calls.push(tiers.map(({ total }) => total));
    if (tiers[0]?.total === 88) throw new Error("Shopify unavailable");
  }, [pair]);
  assert.equal((await saveGroup([["pair", "Pair", "2", "88", "yes", "no"]])).ok, false);
  assert.deepEqual(store.bundles, [pair]);
  assert.deepEqual(calls, [[88], [89]]);
});

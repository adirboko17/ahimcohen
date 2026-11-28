const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { test } = require("node:test");
const ts = require("typescript");

function compile(path, dependencies) {
  const source = readFileSync(resolve(__dirname, "..", path), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function("exports", "require", js)(exports, name => dependencies[name]);
  return exports;
}

const email = "shopper@example.invalid";
const authUser = { email, email_confirmed_at: "2026-01-01" };
const order = { id: "gid://shopify/Order/123", email };
const other = { id: "gid://shopify/Order/456", email: "other@example.invalid" };
function setup(user, nodes) {
  const queries = [];
  const { GET } = compile("app/api/account/orders/route.ts", {
    "@supabase/supabase-js": { createClient: () => ({ auth: { getUser: async () => ({ data: { user } }) } }) },
    "@/lib/customer-auth-config": { customerAuthConfig: () => ({}) },
    "@/lib/shopify/admin-bundles": { adminGraphQL: async (_, params) => {
      queries.push(params);
      return { orders: { nodes, pageInfo: { hasNextPage: false } } };
    } },
  });
  return { queries, get: (params, headers = { Authorization: "Bearer test" }) =>
    GET(new Request("https://example.invalid/api/account/orders?" + params, { headers })) };
}

test("order history requires a verified session before querying Shopify", async () => {
  for (const [user, headers] of [[authUser, {}], [null, undefined], [{ ...authUser, email_confirmed_at: null }, undefined]]) {
    const api = setup(user, []);
    assert.equal((await api.get("", headers)).status, 401);
    assert.equal(api.queries.length, 0);
  }
});

test("order list uses only the account email, rechecks ownership and disables caching", async () => {
  const api = setup(authUser, [order, other]);
  const res = await api.get("email=other@example.invalid");
  assert.equal(api.queries[0].search, 'email:"shopper@example.invalid"');
  assert.deepEqual(await res.json(), { items: [{ id: order.id }], next: null });
  assert.match(res.headers.get("Cache-Control"), /private, no-store/);
});

test("detail pages require both matching owner and matching order ID even when paginating", async () => {
  for (const row of [other, { ...order, id: other.id }]) {
    const api = setup(authUser, [row]);
    assert.equal((await api.get("order=123&after=abc")).status, 404);
  }
});

test("repeat purchase uses the original variant and respects existing cart limits", () => {
  const choice = { id: "v1", color: "blue", size: "M", available: true };
  const product = { id: "shirt", choices: [choice], colors: ["blue"] };
  const { orderCartSelection } = compile("lib/customer-orders.ts", { "./catalog": { pickVariant: () => choice } });
  const line = { handle: "shirt", variantId: "v1", quantity: 2, name: "original shirt" };
  const run = (lines, cart = []) => orderCartSelection(lines, () => product, cart);
  assert.deepEqual(run([line, { ...line, variantId: "old", name: "removed" }]),
    { items: [["shirt", 0, "M", 2]], unavailable: ["removed"] });
  assert.equal(run([line], [{ variantId: "v1", qty: 249, key: "shirt|blue|M" }]).items.length, 0);
  assert.equal(run([line], Array.from({ length: 50 }, (_, i) => ({ key: String(i) }))).items.length, 0);
});

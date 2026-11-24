// Build-only TypeScript loader: uses the exact storefront mapping and queries,
// without maintaining a second implementation or requiring a runtime TS loader.
const fs = require("node:fs");
const path = require("node:path");
const { gzipSync } = require("node:zlib");
const ts = require("typescript");
const { loadEnvConfig } = require("@next/env");
const root = path.resolve(__dirname, "..");
const modules = new Map();

function load(filename) {
  if (!path.extname(filename)) filename += ".ts";
  if (path.extname(filename) === ".json") return JSON.parse(fs.readFileSync(filename, "utf8"));
  if (modules.has(filename)) return modules.get(filename).exports;
  const module = { exports: {} };
  modules.set(filename, module);
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const localRequire = name => {
    if (name === "server-only") return {}; // This entire process is server-only.
    if (name.startsWith("@/")) return load(path.join(root, name.slice(2)));
    if (name.startsWith(".")) return load(path.resolve(path.dirname(filename), name));
    return require(name);
  };
  new Function("require", "module", "exports", source)(localRequire, module, module.exports);
  return module.exports;
}

async function prepareCatalog() {
  loadEnvConfig(root, false);
  const config = load(path.join(root, "lib/shopify/config.ts"));
  const { fetchShopCatalog } = load(path.join(root, "lib/shopify/fetch-catalog.ts"));
  const catalog = await fetchShopCatalog();
  if (!catalog.products.length || !catalog.categories.length) throw new Error("Refusing to build with an empty catalog.");
  const seed = {
    version: 2,
    scope: JSON.stringify([config.shopDomain(), config.storefrontApiVersion(), config.metafieldIdentifiers()]),
    createdAt: new Date().toISOString(),
    encoded: gzipSync(JSON.stringify(catalog)).toString("base64"),
  };
  const directory = path.join(root, ".generated");
  fs.mkdirSync(directory, { recursive: true });
  const destination = path.join(directory, "catalog-bootstrap.json");
  const temporary = `${destination}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(seed));
  fs.renameSync(temporary, destination);
  console.log(`Prepared ${catalog.products.length} products and ${catalog.categories.length} categories for server startup (${Math.round(fs.statSync(destination).size / 1024)} KB).`);
}

prepareCatalog().catch(error => {
  console.error(`Catalog preparation failed: ${error.message}`);
  process.exitCode = 1; // Don't publish a build with a missing or old seed.
});

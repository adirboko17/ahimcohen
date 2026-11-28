const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const zlib = require('node:zlib');
const ts = require('typescript');
const source = ts.transpileModule(readFileSync('lib/shopify/catalog-bootstrap.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function reader(contents) {
  let reads = 0;
  const dependencies = {
    'server-only': {}, 'node:path': require('node:path'), 'node:zlib': zlib, 'node:util': require('node:util'),
    'node:fs/promises': { readFile: async () => { reads++; if (contents === null) throw new Error('ENOENT'); return contents; } },
  };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', source)(name => dependencies[name], module, module.exports);
  return { read: module.exports.readCatalogBootstrap, reads: () => reads };
}
const catalog = { categories: [{ id: 'work' }], products: [{ id: 'shirt', choices: [{ color: 'navy', size: 'M', available: true, price: 100 }] }],
  categorySources: { shirt: { id: 'gid://shopify/Product/1', direct: ['work'] } } };
const encode = value => zlib.gzipSync(JSON.stringify(value)).toString('base64');
const seed = { version: 4, productCount: 1, categoryCount: 1, scope: 'store-a', createdAt: new Date().toISOString(), encoded: encode(catalog) };

test('packaged catalog is validated and read only once per process, preserving variants', async () => {
  const h = reader(JSON.stringify(seed));
  const values = await Promise.all([h.read('store-a'), h.read('store-a'), h.read('store-a')]);
  assert.equal(h.reads(), 1);
  for (const value of values) assert.deepEqual(JSON.parse(zlib.gunzipSync(Buffer.from(value, 'base64'))), catalog);
  assert.equal(await h.read('store-b'), null);
  assert.equal(await h.read('store-a'), seed.encoded);
});

test('missing, corrupt, incompatible and empty artifacts fall back to live loading', async () => {
  for (const contents of [null, '{', JSON.stringify({ ...seed, version: 1 }), JSON.stringify({ ...seed, createdAt: 'bad' }), JSON.stringify({ ...seed, encoded: 'broken' }), JSON.stringify({ ...seed, encoded: zlib.gzipSync('{"products":[],"categories":[]}').toString('base64') })]) {
    assert.equal(await reader(contents).read('store-a'), null);
  }
});

test('incomplete snapshots with valid compressed data fall back to live loading', async () => {
  for (const change of [
    { version: 3 }, { productCount: 2 }, { categoryCount: 2 },
    { encoded: encode({ ...catalog, categorySources: undefined }) },
    { encoded: encode({ ...catalog, categorySources: {} }) },
  ]) {
    assert.equal(await reader(JSON.stringify({ ...seed, ...change })).read('store-a'), null);
  }
});

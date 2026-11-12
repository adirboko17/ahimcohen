const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync, existsSync } = require('node:fs');
const { resolve } = require('node:path');
const ts = require('typescript');
const index = require('../lib/brand-products.json');
function load(path, dependencies = {}) {
  const source = ts.transpileModule(readFileSync(resolve(__dirname, path), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', source)(name => { assert.ok(name in dependencies, name); return dependencies[name]; }, module, module.exports);
  return module.exports;
}
const brands = load('../lib/brands.ts');
const { productBrand } = load('../lib/shopify/product-brand.ts', { 'server-only': {}, '@/lib/brand-products.json': index, '@/lib/brands': brands });
const { BRANDS, brandById, canonicalBrandName, uniqueBrandNames } = brands;

test('supplier imports resolve to audited manufacturers without blanket assignment', () => {
  assert.equal(productBrand({ handle: 'כפפות-showa-376', vendor: 'worker.co.il' }), 'SHOWA');
  assert.equal(productBrand({ handle: 'מגף-הוברט-o2-src-חום-כהה', vendor: 'worker.co.il' }), 'Steel Blue');
  assert.equal(productBrand({ handle: 'unknown-import', vendor: 'worker.co.il' }), undefined);
  assert.equal(productBrand({ handle: 'פליז-חצי-רוכסן-wecamp-20', vendor: 'worker.co.il' }), 'WECAMP');
  assert.equal(productBrand({ handle: 'כפפות-showa-376', vendor: 'Corrected manufacturer' }), 'Corrected manufacturer');
});
test('follow-up review applies confirmed labels and keeps ambiguous imports unassigned', () => {
  const review = require('../assets/brand-followup-review.json');
  const baseline = require('../assets/brand-followup-baseline.json');
  assert.equal(review.products.length, baseline.length);
  assert.equal(new Set(review.products.map(p => p.handle)).size, baseline.length);
  for (const product of review.products) {
    assert.ok(baseline.some(item => item.handle === product.handle));
    if (product.status === 'confirmed') {
      assert.ok(product.brand && product.sources.length && product.reason);
      assert.equal(productBrand({ handle: product.handle, vendor: 'worker.co.il' }), product.brand);
      assert.ok(BRANDS.some(brand => brand.name === product.brand));
    } else {
      assert.equal(productBrand({ handle: product.handle, vendor: 'worker.co.il' }), undefined);
    }
  }
  assert.equal(review.products.find(p => p.sku === '990').brand, 'JSP'); // Similar generic title is WORKER, but original kneepads visibly carry JSP.
  assert.equal(review.products.find(p => p.sku === '839').brand, 'WORKER'); // Same title at supplier, different SKU (4053) is Neri.
  assert.equal(review.products.find(p => p.sku === '4044-2').status, 'conflict'); // Photo and legacy product description disagree.
  assert.equal(review.products.find(p => p.sku === 'MB26').brand, 'REGELTEX'); // Actual manufacturer label, not general supplier field.
});
test('vendor aliases group both Redback spellings and correct Carharrt', () => {
  for (const vendor of ['REDBACK', 'redback.co.il']) assert.equal(productBrand({ handle: 'new-item', vendor }), 'Redback');
  assert.equal(productBrand({ handle: 'new-item', vendor: 'Carharrt' }), 'Carhartt');
});

test('filter names are canonical and supplier domains do not impersonate a manufacturer', () => {
  assert.deepEqual(uniqueBrandNames(['worker', 'WORKER', ' Worker ', 'worker.co.il', 'https://www.worker.co.il/', 'REDBACK', 'redback.co.il', 'Carharrt', 'Carhartt']), ['WORKER', 'Redback', 'Carhartt']);
  assert.equal(canonicalBrandName('  Steel   Blue  '), 'Steel Blue');
  assert.equal(canonicalBrandName(''), undefined);
  assert.equal(canonicalBrandName('Independent manufacturer'), 'Independent manufacturer');
});
test('featured brand destinations contain audited products and original local logos', () => {
  assert.equal(new Set(BRANDS.map(b => b.id)).size, BRANDS.length);
  for (const brand of BRANDS) {
    assert.ok(Object.values(index).includes(brand.name), brand.name);
    assert.equal(brandById(brand.id), brand);
    if (brand.featured) assert.ok(brand.logo && existsSync(resolve(__dirname, '../public' + brand.logo)), brand.name);
  }
  assert.equal(brandById('unknown'), undefined);
  assert.ok(!BRANDS.some(b => ['FORCE', '3M', 'Vibram'].includes(b.name)));
});

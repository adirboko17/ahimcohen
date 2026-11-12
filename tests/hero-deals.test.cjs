const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const ts = require('typescript');
function load(file, dependencies = {}) {
  const code = ts.transpileModule(readFileSync(resolve(__dirname, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => {
    assert.ok(name in dependencies, name);
    return dependencies[name];
  }, module, module.exports);
  return module.exports;
}
const quantity = load('../lib/quantity-offers.ts');
const pricing = load('../lib/pricing.ts', { './catalog': { PM: {} } });
const { heroDeals } = load('../lib/hero-deals.ts', { './quantity-offers': quantity, './pricing': pricing });
const product = extra => ({ id: 'shirt', name: 'חולצה', price: 89, ...extra });

test('hero uses the qualifying total and offer destination for multi-buy products', () => {
  const [deal] = heroDeals([product({ id: 'חולצה/א', deal: [2, 140] })]);
  assert.equal(deal.price, 140);
  assert.equal(deal.href, '/p/' + encodeURIComponent('חולצה/א') + '?quantity-offer=1');
  assert.match(deal.description, /2 יחידות במבצע/);
  assert.match(deal.description, /178/);
});

test('hero keeps pack price and fractional sale prices without rounding', () => {
  const [pack, single] = heroDeals([
    product({ name: 'מארז שתי חולצות בייסיק', price: 99, was: 119 }),
    product({ id: 'sale', price: 79.9, was: 100 }),
  ]);
  assert.equal(pack.price, 99);
  assert.match(pack.description, /2 יחידות במארז/);
  assert.equal(single.price, 79.9);
  assert.equal(single.href, '/p/sale');
});

test('hero excludes regular, invalid and sold-out products and supports zero or one offer', () => {
  assert.deepEqual(heroDeals([]), []);
  assert.deepEqual(heroDeals([
    product({}), product({ was: 80 }), product({ price: NaN, was: 100 }),
    product({ was: 100, choices: [{ available: false }] }),
  ]), []);
  assert.equal(heroDeals([product({ was: 100, choices: [{ available: false }, { available: true }] })]).length, 1);
  assert.equal(heroDeals(Array.from({ length: 10 }, (_, i) => product({ id: String(i), was: 100 }))).length, 7);
});

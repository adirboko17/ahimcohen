// Run after audit-brands.cjs and the supplier catalog audit. Never changes Shopify.
const fs = require('node:fs');
const { products, checkedAt } = require('../assets/brand-catalog-audit.json');
const supplier = require('../assets/brand-supplier-catalog.json');
const followup = require('../assets/brand-followup-review.json');
const reviewedProducts = new Map(followup.products.map(product => [product.handle, product]));
const normalize = value => value.trim().replace(/\s+/g, ' ').toUpperCase();
const aliases = { 'BIRKINSTOCK': 'Birkenstock', 'אגו שף': 'Ego Chef', 'CARHARTT': 'Carhartt', 'CARHARRT': 'Carhartt', 'STEEL BLUE': 'Steel Blue', 'REDBACK.CO.IL': 'Redback', 'REDBACK': 'Redback', 'JEEP': 'Jeep', 'NERI ITALY': 'Neri', 'AHIM COHENN': 'האחים כהן', 'האחים כהן – ביגוד והלבשה': 'האחים כהן' };
const canonical = value => aliases[normalize(value)] || normalize(value);
const byModel = new Map();
for (const item of supplier) {
  const sizePosition = item.options.find(option => /size|מידה/i.test(option.name))?.position;
  if (!sizePosition) continue;
  for (const variant of item.variants) {
    const size = variant['option' + sizePosition]?.replace(/\s/g, '');
    if (!size || !variant.sku?.endsWith(size)) continue;
    const prefix = variant.sku.slice(0, -size.length);
    if (!/\d{2}$/.test(prefix)) continue;
    const model = prefix.slice(0, -2); // Remove the supplier's two-digit color code.
    const items = byModel.get(model) || [];
    items.push(item);
    byModel.set(model, items);
  }
}
const index = {}, evidence = [], unresolved = [], conflicts = [];
for (const product of products) {
  let brand, reason, source;
  if (product.vendor !== 'worker.co.il') {
    brand = canonical(product.vendor); reason = 'Shopify vendor';
  } else {
    const models = [...new Set(product.variants.nodes.map(v => v.sku?.replace(/-\d+$/, '')).filter(Boolean))];
    const matched = [...new Set(models.flatMap(model => byModel.get(model) || []))];
    const vendors = [...new Set(matched.map(item => canonical(item.vendor)))];
    if (vendors.length === 1 && vendors[0] !== 'יוניסקס') {
      brand = vendors[0]; reason = 'Exact supplier model (size and color removed)';
      source = 'https://www.worker.co.il/products/' + encodeURIComponent(matched[0].handle);
    }
    // Explicit product branding can identify discontinued models absent from today's supplier catalog.
    // Do not identify a finished product from component brands (3M, Vibram, YKK, etc.).
    const text = product.title + ' ' + product.description;
    const explicit = /carhartt|קארהארט|קארהרט/i.test(text) ? 'Carhartt'
      : /\bjeep\b/i.test(text) ? 'Jeep'
      : /אגו[\s-]+שף/i.test(product.title) ? 'Ego Chef'
      : /\bshowa\b/i.test(product.title) ? 'SHOWA'
      : /\bwecamp\b/i.test(product.title) ? 'WECAMP'
      : /\bsteel blue\b/i.test(text) ? 'Steel Blue'
      : null;
    if (explicit && brand && explicit !== brand) {
      conflicts.push({ handle: product.handle, title: product.title, supplier: brand, explicit });
      brand = undefined; reason = undefined;
    } else if (!brand && explicit) { brand = explicit; reason = 'Explicit brand in Shopify product text'; }
    if (!brand && !conflicts.some(item => item.handle === product.handle)) {
      // These named technologies belong to Carhartt, verified against its official catalog.
      if (/\b(?:RUGGED FLEX|FULL SWING|RAIN DEFENDER|SUPER DUX)\b/i.test(text)) {
        brand = 'Carhartt'; reason = 'Carhartt named product technology'; source = 'https://www.carhartt.com/en-eu/c/collections/rugged-flex/euc2000062';
      }
    }
  }
  const review = reviewedProducts.get(product.handle);
  if (product.vendor === 'worker.co.il' && review) {
    if (review.status === 'confirmed') {
      brand = review.brand; reason = review.reason; source = review.sources[0];
    } else {
      // A reviewed ambiguity must not become an automatic assignment on a later rebuild.
      brand = undefined; reason = undefined; source = undefined;
      if (review.status === 'conflict') conflicts.push({ handle: product.handle, title: product.title, candidate: review.candidate, reason: review.reason });
    }
  }
  if (brand) {
    index[product.handle] = brand;
    evidence.push({ handle: product.handle, title: product.title, originalVendor: product.vendor, brand, reason, source });
  } else unresolved.push({ handle: product.handle, title: product.title });
}
fs.writeFileSync('lib/brand-products.json', JSON.stringify(index, null, 2) + '\n');
const counts = {};
for (const item of evidence) counts[item.brand] = (counts[item.brand] || 0) + 1;
const remainingConflicts = conflicts.filter(item => !index[item.handle]);
fs.writeFileSync('assets/brand-audit-results.json', JSON.stringify({ checkedAt, reviewedAt: followup.checkedAt, total: products.length, identified: evidence.length, unresolvedCount: unresolved.length, counts, conflicts: remainingConflicts, evidence, unresolved }, null, 2) + '\n');
console.log(JSON.stringify({ identified: evidence.length, unresolved: unresolved.length, counts, conflicts: remainingConflicts }, null, 2));

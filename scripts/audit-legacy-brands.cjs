// Read-only public supplier lookup. Does not access or change Shopify admin data.
const fs = require('node:fs');
const baseline = require('../assets/brand-followup-baseline.json');
const products = require('../assets/brand-catalog-audit.json').products;
const handles = new Set(baseline.map(p => p.handle));
const skus = [...new Set(products.filter(p => handles.has(p.handle)).flatMap(p => p.variants.nodes.map(v => v.sku?.replace(/-\d+$/, '')).filter(Boolean)))];
(async () => {
  const found = [];
  for (let i = 0; i < skus.length; i += 40) {
    const url = new URL('https://business.worker.co.il/wp-json/wc/store/v1/products');
    url.searchParams.set('sku', skus.slice(i, i + 40).join(','));
    url.searchParams.set('per_page', '100');
    const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
    if (!response.ok) throw new Error(`Public supplier lookup: ${response.status}`);
    const items = await response.json();
    if (!Array.isArray(items)) throw new Error('Unexpected supplier response');
    found.push(...items.map(({ id, sku, name, permalink, brands, images, description }) => ({ id, sku, name, permalink, brands, images: images.map(({src,alt}) => ({src,alt})), description })));
    console.log(`Checked ${Math.min(i + 40, skus.length)}/${skus.length} SKUs; returned ${items.length} products`);
  }
  fs.writeFileSync('assets/brand-legacy-supplier.json', JSON.stringify({ checkedAt: new Date().toISOString(), products: found }, null, 2) + '\n');
  const counts = {};
  for (const p of found) for (const b of p.brands) counts[b.name] = (counts[b.name] || 0) + 1;
  console.log(JSON.stringify({ found: found.length, counts }, null, 2));
})().catch(error => { console.error(error.message); process.exitCode = 1; });

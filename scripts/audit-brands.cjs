// Read-only Shopify audit. Only public product data is written to the report.
const fs = require('node:fs');
require('@next/env').loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
const pick = keys => keys.map(key => process.env[key]?.trim()).find(Boolean);
const domain = pick(['SHOPIFY_STORE_DOMAIN', 'SHOPIFY_STOREFRONT_DOMAIN', 'PUBLIC_STORE_DOMAIN', 'SHOPIFY_SHOP_DOMAIN', 'SHOPIFY_SHOP']);
const privateToken = pick(['SHOPIFY_STOREFRONT_PRIVATE_TOKEN', 'PRIVATE_STOREFRONT_API_TOKEN', 'SHOPIFY_STOREFRONT_API_TOKEN']);
const publicToken = pick(['SHOPIFY_STOREFRONT_PUBLIC_TOKEN', 'PUBLIC_STOREFRONT_API_TOKEN']);
const version = pick(['SHOPIFY_STOREFRONT_API_VERSION', 'SHOPIFY_API_VERSION']) || '2026-10';
async function main() {
  if (!domain || (!privateToken && !publicToken)) throw new Error('Missing Shopify configuration');
  const products = [];
  let after = null;
  do {
    const response = await fetch(`https://${domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '')}/api/${version}/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(privateToken ? { 'Shopify-Storefront-Private-Token': privateToken } : { 'X-Shopify-Storefront-Access-Token': publicToken }) },
      body: JSON.stringify({ query: 'query BrandAudit($after:String){products(first:100,after:$after){nodes{handle title vendor description tags variants(first:100){nodes{sku}} collections(first:30){nodes{handle title}} featuredImage{url altText}}pageInfo{hasNextPage endCursor}}}', variables: { after } }),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`Shopify HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.errors) throw new Error('Shopify query failed: ' + payload.errors.map(e => e.message).join('; '));
    products.push(...payload.data.products.nodes);
    const page = payload.data.products.pageInfo;
    after = page.hasNextPage ? page.endCursor : null;
  } while (after);
  fs.writeFileSync('assets/brand-catalog-audit.json', JSON.stringify({ checkedAt: new Date().toISOString(), products }, null, 2));
  const supplier = [];
  for (let page = 1; ; page++) {
    const response = await fetch(`https://www.worker.co.il/products.json?limit=250&page=${page}`, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Supplier HTTP ${response.status}`);
    const payload = await response.json();
    supplier.push(...payload.products.map(item => ({
      handle: item.handle, title: item.title, vendor: item.vendor, options: item.options,
      variants: item.variants.map(variant => ({ sku: variant.sku, option1: variant.option1, option2: variant.option2, option3: variant.option3 })),
    })));
    if (payload.products.length < 250) break;
  }
  fs.writeFileSync('assets/brand-supplier-catalog.json', JSON.stringify(supplier, null, 2));
  console.log(JSON.stringify({ total: products.length, collections: [...new Set(products.flatMap(p => p.collections.nodes.map(c => c.title)))], tags: [...new Set(products.flatMap(p => p.tags))] }, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

// Run against a local production build; this measures HTTP, not browser rendering.
const assert = require("node:assert/strict");
const base = new URL(process.env.PERFORMANCE_URL || "http://127.0.0.1:3105");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(base.hostname));

async function measure(path, label) {
  const start = performance.now();
  const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(120_000) });
  const headersMs = performance.now() - start;
  const html = await response.text();
  assert.equal(response.status, 200, `${label}: HTTP ${response.status}`);
  assert.ok(!html.includes('"digest":') && !html.includes('NEXT_HTTP_ERROR_FALLBACK'), `${label}: server render failed`);
  console.log(JSON.stringify({
    label, path, status: response.status, headersMs: Math.round(headersMs),
    completeMs: Math.round(performance.now() - start), bytes: Buffer.byteLength(html),
  }));
  return html;
}

(async () => {
  const home = await measure("/", "home-first-request");
  const category = home.match(/href="(\/c\/[^"?]+)"/)?.[1];
  const product = home.match(/href="(\/p\/[^"?]+)"/)?.[1];
  assert.ok(category && product, "Expected real category and product links in home HTML");
  for (let round = 1; round <= 3; round++) {
    await measure(category, `category-${round}`);
    await measure(product, `product-${round}`);
  }
  await measure(`${category}?sub=${encodeURIComponent("בדיקת סינון")}`, "category-query");
})().catch((error) => { console.error(error.message); process.exitCode = 1; });

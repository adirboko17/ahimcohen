# Navigation performance — 2026-11-12

The old loader rebuilt the complete Shopify catalog whenever its process-local
60-second cache expired. Layout, page and metadata could start overlapping loads.
Category filter changes also triggered an unnecessary server navigation.

## Changes

- A Next Data Cache snapshot retains the 60-second refresh interval, serves stale
  data during background refresh, and keeps the last successful result on failure.
- React request memoization and shared in-flight loads prevent duplicate catalog
  fetches. Cache keys include the store, API version and metafield configuration.
- The root layout renders on request without globally disabling the data cache.
- Root Suspense and `app/loading.tsx` provide loading feedback and a route loading
  boundary. The catalog still has to load on a completely cold first visit.
- Category filters update native history and `useSearchParams` locally, retaining
  shareable query URLs without fetching the same catalog again.
- `npm run dev` uses Turbopack. `npm run dev:webpack` retains the previous compiler.
- Cart and checkout requests remain uncached.

## Verification

- `npm test`: 5 passing tests using the installed Next cache implementation with
  deterministic storage and Shopify fixtures: concurrent cold loads, warm reuse,
  non-blocking stale refresh, refresh failure/retry, cold failure/retry and store
  isolation (some cases share a test).
- Production build and TypeScript validation passed.
- Real Shopify data was used for read-only HTTP checks on isolated loopback ports.
  The temporary verification servers were stopped after testing.

| Local mode | Complete category/product HTTP response |
| --- | --- |
| Production build, warm | 98–117 ms |
| Production build, subsequent refresh interval | 97–107 ms |
| Development/Turbopack, first category and product visits after catalog load | 867–964 ms |
| Development/Turbopack, warm | 252–318 ms |

The first home request with an empty cache took 6.5 seconds in production mode
and 9 seconds in development mode, including the complete catalog fetch.
The response headers/loading stream began earlier (84 ms and 1.99 s respectively).
These are local HTTP timings, not browser paint, image download or click-to-render
measurements. No browser testing was performed. No numerical before/after speedup
is claimed because the previous implementation was not benchmarked.

## Reproduce

Restart the existing development server with `npm run dev` to use Turbopack.
Run `npm test` for cache regression checks.

Development output is isolated in `.next-dev/<compiler>-<port>`. Production
builds still use `.next`, and explicit `NEXT_DIST_DIR` overrides remain supported.
This prevents concurrent Webpack/Turbopack servers from overwriting each other's
React client manifests. Do not set the same override for two running servers.

For isolated HTTP verification in PowerShell:

```powershell
$env:NEXT_DIST_DIR = '.next-check'
npm run build
node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3105
```

In another terminal, run `node scripts/check-navigation.cjs`. Set
`PERFORMANCE_URL` to another loopback URL when testing a different port.
The script only reads pages and follows category/product links found in the HTML.

The app still serializes the full catalog into its initial document. HTTP
compression reduces transfer size, but route-specific catalog payloads remain a
separate optimization opportunity.

## Catalog cache overflow fix — 2026-11-12

After variant image URLs were added, the real catalog reached 2,310,080 bytes
(1,167 products and 5,801 variants). Next logged `items over 2MB can not be cached`.
The persistent snapshot could no longer be saved, causing subsequent requests to
rebuild the catalog instead of reusing it.

The cache now stores a lossless gzip/base64 snapshot under the versioned
`shop-catalog-v4-gzip` key. Compression/decompression runs asynchronously on the
server. The real serialized cache entry is 335,350 bytes. Consumers still receive
the same products, variants, availability, prices and photos. The existing
60-second stale-while-revalidate policy and failure recovery remain intact; cart
and checkout requests are unchanged.

Validation:

- All 89 tests passed, including a new >2 MB catalog regression that verifies a
  second request uses the cache and all variant details survive compression.
- TypeScript and an isolated production build passed.
- Read-only HTTP measurements of `https://ahimcohen.vercel.app` before release:
  home 5,747 ms, category 5,141 ms, product 5,056 ms, repeated home 4,996 ms.
- Local production build with the fix and real Shopify data: empty-cache home
  6,501 ms, warm category/product responses 129–149 ms, warm home 173 ms.
- After restarting the production process, the same persistent snapshot served
  home/category/product in 264/156/147 ms, without another blocking cold load.
- These are complete HTTP response times, not browser paint metrics. Local and
  remote environments differ, so this is not a measured production speedup.
  The first empty-cache load still needs to fetch Shopify. Production release
  and a follow-up remote measurement are required to confirm the live result.

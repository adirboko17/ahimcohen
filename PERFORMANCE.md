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
  The first empty-cache load still needs to fetch Shopify.

After the user manually deployed, read-only measurements of the same production
URLs returned HTTP 200 with no detected server-render error:

| Complete HTTP response | Before release | After manual release |
| --- | ---: | ---: |
| Home | 5,747 ms | 1,252 ms |
| Category `/c/shoes` | 5,141 ms | 714 ms |
| Product `/p/perth-nylon` | 5,056 ms | 832 ms |
| Repeated home | 4,996 ms | 834 ms |

This small sample shows about 78–86% shorter complete response times. It is not
a browser rendering benchmark or a guarantee for cold requests. No deployment
was performed by the agent; verification only read the public pages.

## Responsive media and catalog transfer — 2026-11-12

Product images now request responsive widths directly from Shopify's image CDN.
The shared `ProductImage` defaults to lazy loading and asynchronous decoding;
the first two category cards and first mobile gallery slide load eagerly, with
high priority. Desktop gallery images remain lazy so the hidden desktop gallery
does not compete with the mobile image. Thumbnails use smaller width limits.
Existing CSS reserves image space. Unsupported/signed URLs pass through intact.

Category artwork has 320/640-pixel derivatives. The hero has 480/800/1200/1536
variants at a lower WebP quality, while retaining the existing composition.
Rebuild local derivatives with `node scripts/optimize-storefront-images.cjs`.

Measured file sizes (bytes, not page-load durations):

| Asset | Previous | Optimized |
| --- | ---: | ---: |
| All nine category artworks, 320px mobile set | 1,565,942 | 60,858 |
| Hero at 800px | 90,840 | 39,446 |
| Hero at 1536px | 324,544 | 140,610 |
| Fleece photo, original vs CDN 480px | 357,720 | 16,446 |
| Two-shirt pack photo, original vs CDN 480px | 106,908 | 36,519 |

CDN measurements used a browser-style image Accept header; returned formats
varied between JPEG and WebP. The browser selects width according to layout and
pixel density. Not all nine category images load on initial view.

The RSC catalog payload also deduplicates variant photos/color/size strings and
uses compact variant tuples. It is expanded once per snapshot in CatalogProvider.
All products and fields remain available immediately for search, quick-add,
filters and restored carts; no extra client fetch is introduced.

| Complete HTML response | Live baseline bytes | Local optimized bytes | Baseline gzip | Optimized gzip |
| --- | ---: | ---: | ---: | ---: |
| Home | 2,563,482 | 1,645,039 | 267,135 | 245,099 |
| Shoes | 2,550,807 | 1,626,570 | 264,601 | 242,166 |
| PERTH product | 2,559,809 | 1,647,279 | 265,770 | 244,070 |

About 36% less uncompressed HTML and 8% less under the same local gzip settings.
Actual CDN transfer compression can differ. Catalog snapshots were fetched
separately and their display order can differ. Local warm category/product HTTP
responses were 147/152 ms; the initial empty-cache home still took 7.5 seconds.
These local timings are not a production mobile speed score.

Validation: 95 tests passed, TypeScript and the production build passed. Added
lossless catalog round-trip and CDN URL regression coverage. Browser checks at
390px verified home, category, gallery, color selection, add/remove from cart and
search; no horizontal overflow or captured console errors. The mobile hero
selected the 480px file at the test browser's pixel density, category artwork
selected 320px, and later gallery slides remained unloaded. The desktop gallery
also loaded correctly at 1440px. No CPU/network throttling or real-phone LCP/INP
measurement was performed. Changes still require the user's manual deployment.

## Mobile hero quality correction — 2026-11-13

The mobile hero now uses the original 800/1536px v2 exports. The lower-quality
v3 recompressions remain available for the existing desktop preview, but are
no longer selected by the mobile picture source. Its `sizes` now accounts for
the 3:2 artwork covering `clamp(300px, 88vw, 440px)` in height: the image's
painted width is larger than its clipped container. At 390px and 453px browser
viewports (DPR 1), the browser selected the original 800px file instead of the
480px recompression. This intentionally trades some transfer size for detail.

The homepage brand section is directly below categories. All 12 logo assets
loaded, and all 12 destinations showed the matching brand and product count.
Mobile 390px and desktop 1440px checks showed no horizontal overflow. The six
brand and responsive-media tests passed. No production deployment was performed.

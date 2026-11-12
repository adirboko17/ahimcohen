const assert = require("node:assert/strict");
const { test } = require("node:test");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

function load(file, dependencies = {}) {
  const compiled = ts.transpileModule(readFileSync(resolve(__dirname, "..", file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", compiled)(
    (name) => Object.hasOwn(dependencies, name) ? dependencies[name] : require(name), module, module.exports,
  );
  return module.exports;
}

const colors = load("lib/colors.ts");
const sizes = load("lib/sizes.ts");
const variantFilters = load("lib/category-filters.ts", { "./colors": colors, "./sizes": sizes });
const productSelection = load("lib/product-selection.ts", { "./colors": colors, "./sizes": sizes, "./category-filters": variantFilters });
const { ProductTile } = load("components/ProductTile.tsx", {
  "next/link": ({ children, ...props }) => React.createElement("a", props, children),
  "@/lib/catalog": { ...colors, phOf: () => "" },
  "@/lib/catalog-context": { useCatalog: () => ({ category: () => ({ name: "Work" }) }) },
  "@/lib/colors": colors,
  "@/lib/pricing": { fmt: String, saleBadge: () => "Sale" },
  "@/lib/store": { useStore: () => ({ openQuick: () => {} }) },
  "./icons": { IconPlus: () => null },
});
const emptyFilters = { colors: [], sizes: [], std: [], brands: [], max: null, stock: false };
const products = [
  { id: "shirt", cat: "work", sub: "Shirts", name: "Shirt", price: 50, colors: ["navy"], sizes: ["XXL"] },
  { id: "pants", cat: "work", sub: "Pants", name: "Pants", price: 100, colors: ["צהוב אבן"], sizes: ["42"] },
  { id: "shared", cat: "work", sub: "Uniforms", subs: ["Uniforms", "Shirts"], name: "Shared shirt", price: 70, colors: ["white"], sizes: ["M"] },
  { id: "shoe", cat: "shoes", sub: "Shirts", name: "Other category", price: 200, colors: ["red"], sizes: ["46"] },
];

function renderCategory(sub, filters = {}, catalog = products) {
  const category = { id: "work", name: "Work", subs: ["Shirts", "Pants", "Empty"] };
  const { CategoryView } = load("components/CategoryView.tsx", {
    "next/link": ({ children, ...props }) => React.createElement("a", props, children),
    "next/navigation": { useRouter: () => ({}), useSearchParams: () => new URLSearchParams(sub ? { sub } : {}) },
    "@/lib/catalog": colors,
    "@/lib/catalog-context": { useCatalog: () => ({ category: () => category, categories: [category], productsInCategory: (id) => catalog.filter((p) => p.cat === id) }) },
    "@/lib/category-filters": variantFilters,
    "@/lib/colors": colors,
    "@/lib/sizes": sizes,
    "@/lib/category-history": { CATEGORY_PAGE_SIZE: 8, useCategoryHistory: () => ({ filters: { ...emptyFilters, ...filters }, sort: "pop", shown: 8, restoring: false }) },
    "@/lib/pricing": { fmt: String },
    "@/lib/store": { useScrollLock: () => {} },
    "./icons": { IconFilter: () => null },
    "./ProductTile": { ProductTile: (props) => React.createElement("div", { "data-product": props.p.id }, React.createElement(ProductTile, props)) },
  });
  const html = renderToStaticMarkup(React.createElement(CategoryView, { catId: "work" }));
  return { html, sidebar: html.match(/<aside\b[^>]*>([\s\S]*?)<\/aside>/)[1] };
}

test("subcategory filters contain only its products, including secondary subcategory membership", () => {
  const { html, sidebar } = renderCategory("Shirts");
  assert.match(sidebar, /aria-label="כחול כהה"/);
  assert.match(sidebar, /aria-label="לבן"/);
  assert.match(sidebar, />2XL<\/button>/);
  assert.match(sidebar, />M<\/button>/);
  assert.doesNotMatch(sidebar, /צהוב אבן|>42<\/button>|אדום|>46<\/button>/);
  assert.match(html, /data-product="shirt"/);
  assert.match(html, /data-product="shared"/);
  assert.doesNotMatch(html, /data-product="pants"|data-product="shoe"/);
});

test("all-category filters include sibling products but exclude other categories", () => {
  const { sidebar } = renderCategory(null);
  assert.match(sidebar, /צהוב אבן/);
  assert.match(sidebar, />42<\/button>/);
  assert.doesNotMatch(sidebar, /אדום|>46<\/button>/);
  const pants = renderCategory("Pants").sidebar;
  assert.match(pants, /צהוב אבן/);
  assert.doesNotMatch(pants, /כחול כהה|>2XL<\/button>|>M<\/button>/);
});

test("unavailable restored choices do not leave a subcategory empty, while valid aliases still filter", () => {
  const { html } = renderCategory("Shirts", { colors: ["צהוב אבן", "navy"], sizes: ["42", "XXL"] });
  assert.match(html, /data-product="shirt"/);
  assert.doesNotMatch(html, /צהוב אבן|data-product="shared"|אין התאמות/);
  const cleared = renderCategory("Shirts", { colors: ["צהוב אבן"], sizes: ["42"] }).html;
  assert.match(cleared, /data-product="shirt"/);
  assert.match(cleared, /data-product="shared"/);
});

test("empty subcategories show no unrelated color or size choices and retain the clear-filters action", () => {
  const { html, sidebar } = renderCategory("Empty");
  assert.doesNotMatch(sidebar, /color-dot|class="mini/);
  assert.match(html, /אין התאמות/);
  assert.match(html, /ניקוי המסננים/);
});

const variantCatalog = [{
  id: "variants", cat: "work", sub: "Shirts", name: "Variant shirt", price: 50,
  colors: ["navy", "white"], sizes: ["M", "L", "XXL"],
  choices: [
    { id: "navy-m", color: "navy", size: "M", available: true, price: 50 },
    { id: "white-l", color: "white", size: "L", available: true, price: 50 },
    { id: "white-xxl", color: "white", size: "XXL", available: false, price: 50 },
  ],
}];

test("selecting a color shows only sizes paired with that color, even within one product", () => {
  const { html, sidebar } = renderCategory("Shirts", { colors: ["כחול כהה"] }, variantCatalog);
  assert.match(sidebar, />M<\/button>/);
  assert.doesNotMatch(sidebar, />L<\/button>|>2XL<\/button>/);
  assert.match(sidebar, /aria-label="לבן"/); // Other colors can still be added.
  assert.match(html, /data-product="variants"/);
});

test("selecting a size shows only its paired colors and resolves size aliases", () => {
  const { sidebar } = renderCategory("Shirts", { sizes: ["2XL"] }, variantCatalog);
  assert.match(sidebar, /aria-label="לבן"/);
  assert.doesNotMatch(sidebar, /aria-label="כחול כהה"/);
  assert.match(sidebar, />M<\/button>/); // Other sizes can still be added.
});

test("a product must have the selected color and size on the same variant", () => {
  const invalid = renderCategory("Shirts", { colors: ["navy"], sizes: ["L"] }, variantCatalog);
  assert.doesNotMatch(invalid.html, /data-product="variants"/);
  assert.match(invalid.html, /אין התאמות/);
  // Conflicting restored selections remain removable, including in the filter sheet.
  assert.match(invalid.sidebar, /aria-pressed="true"[^>]*>L<\/button>/);
  const valid = renderCategory("Shirts", { colors: ["navy"], sizes: ["M"] }, variantCatalog);
  assert.match(valid.html, /data-product="variants"/);
});

test("multiple selections use a union within each facet and clearing restores the options", () => {
  const run = (filters) => variantFilters.categoryVariantFilters(variantCatalog, { ...emptyFilters, ...filters });
  assert.deepEqual(run({ colors: ["navy", "white"] }).sizes, ["M", "L", "2XL"]);
  assert.deepEqual(run({ sizes: ["M", "L"] }).colors, ["כחול כהה", "לבן"]);
  assert.deepEqual(run({ colors: ["white"] }).sizes, ["L", "2XL"]);
  assert.deepEqual(run({}).sizes, ["M", "L", "2XL"]);
  assert.deepEqual(run({}).colors, ["כחול כהה", "לבן"]);
});

test("in-stock filtering uses availability of the matching variant", () => {
  const run = (filters) => variantFilters.categoryVariantFilters(variantCatalog, { ...emptyFilters, stock: true, ...filters });
  assert.deepEqual(run({ colors: ["white"] }).sizes, ["L"]);
  assert.deepEqual(run({ sizes: ["2XL"] }).colors, []);
  assert.equal(run({ colors: ["white"], sizes: ["2XL"] }).products.length, 0);
  assert.equal(run({ colors: ["white"], sizes: ["L"] }).products.length, 1);
});

test("legacy products without variant metadata still support reciprocal filters", () => {
  const color = renderCategory("Shirts", { colors: ["navy"] }).sidebar;
  assert.match(color, />2XL<\/button>/);
  assert.doesNotMatch(color, />M<\/button>/);
  const size = renderCategory("Shirts", { sizes: ["M"] }).sidebar;
  assert.match(size, /aria-label="לבן"/);
  assert.doesNotMatch(size, /aria-label="כחול כהה"/);
});

test("color and size options respect the other active filters", () => {
  const { sidebar } = renderCategory("Shirts", { max: 55 });
  assert.match(sidebar, /aria-label="כחול כהה"/);
  assert.doesNotMatch(sidebar, /aria-label="לבן"|>M<\/button>/);
});

const picturedCatalog = [{
  ...variantCatalog[0], imgs: ["/default.jpg"],
  choices: variantCatalog[0].choices.map((choice) => ({ ...choice, image: `/${choice.id}.jpg` })),
}];

test("category cards show the chosen color photo and restore the default after clearing", () => {
  const navy = renderCategory("Shirts", { colors: ["כחול כהה"] }, picturedCatalog).html;
  assert.match(navy, /<img src="\/navy-m.jpg"/);
  assert.doesNotMatch(navy, /<img src="\/default.jpg"/);
  const white = renderCategory("Shirts", { colors: ["לבן"], sizes: ["2XL"] }, picturedCatalog).html;
  assert.match(white, /<img src="\/white-xxl.jpg"/);
  const cleared = renderCategory("Shirts", {}, picturedCatalog).html;
  assert.match(cleared, /<img src="\/default.jpg"/);
  // Product tiles elsewhere retain their default image without filter props.
  assert.match(renderToStaticMarkup(React.createElement(ProductTile, { p: picturedCatalog[0] })), /<img src="\/default.jpg"/);
});

test("multiple selected colors choose a photo of a color matching size and stock filters", () => {
  const image = (filters) => variantFilters.categoryProductImage(picturedCatalog[0], { ...emptyFilters, ...filters });
  assert.equal(image({ colors: ["white", "navy"] }), "/white-l.jpg");
  assert.equal(image({ colors: ["navy", "white"], sizes: ["L"] }), "/white-l.jpg");
  assert.equal(image({ colors: ["white"], stock: true }), "/white-l.jpg");
  assert.equal(image({ sizes: ["L"] }), "/white-l.jpg");
});

test("missing variant photos use the same color in another size, then the default image", () => {
  const product = {
    ...picturedCatalog[0],
    choices: picturedCatalog[0].choices.map((choice) => ({ ...choice, image: choice.id === "white-xxl" ? undefined : choice.image })),
  };
  const filters = { ...emptyFilters, colors: ["white"], sizes: ["2XL"] };
  assert.equal(variantFilters.categoryProductImage(product, filters), "/white-l.jpg");
  product.choices = product.choices.map((choice) => ({ ...choice, image: choice.color === "white" ? undefined : choice.image }));
  assert.equal(variantFilters.categoryProductImage(product, filters), "/default.jpg");
  assert.equal(variantFilters.categoryProductImage({ ...product, imgs: [] }, filters), undefined);
  assert.equal(variantFilters.categoryProductImage({ ...product, choices: [] }, filters), "/default.jpg");
});

test("both category card links carry the color corresponding to the shown image", () => {
  const { html } = renderCategory("Shirts", { colors: ["navy", "white"], sizes: ["L"] }, picturedCatalog);
  assert.equal((html.match(/href="\/p\/variants\?color=white&amp;size=L"/g) || []).length, 2);
  assert.match(html, /<img src="\/white-l.jpg"/);
  const plain = renderCategory("Shirts", {}, picturedCatalog).html;
  assert.equal((plain.match(/href="\/p\/variants"/g) || []).length, 2);
  assert.doesNotMatch(plain, /\?color=/);
});

function renderProduct(product, initialColor, initialSize, extras = []) {
  const { ProductView } = load("components/ProductView.tsx", {
    "next/link": ({ children, ...props }) => React.createElement("a", props, children),
    "next/navigation": { useRouter: () => ({}) },
    "@/lib/catalog": { ...colors, FREE_SHIPPING: 299, phOf: () => "" },
    "@/lib/catalog-context": { useCatalog: () => ({ product: (id) => [product, ...extras].find((p) => p.id === id), category: () => ({ name: "Work" }), products: [product, ...extras] }) },
    "@/lib/colors": colors,
    "@/lib/product-selection": productSelection,
    "@/lib/product-recommendations": { complementaryAccessories: () => extras, similarProducts: () => [] },
    "@/lib/sizes": sizes,
    "@/lib/pricing": { fmt: String, priceFor: (p, qty) => p.price * qty, saleBadge: () => "Sale" },
    "@/lib/store": { useStore: () => ({ cart: [] }), useScrollLock: () => {} },
    "./icons": { IconCheck: () => null, IconPhone: () => null, IconPin: () => null, IconTruck: () => null },
    "./ProductTile": { ProductTile },
  });
  return renderToStaticMarkup(React.createElement(ProductView, { id: product.id, initialColor, initialSize }));
}

test("product opens with the linked color selected and its photo first in both galleries", () => {
  for (const [requested, label, image] of [["לבן", "לבן", "/white-l.jpg"], ["navy", "כחול כהה", "/navy-m.jpg"]]) {
    const html = renderProduct(picturedCatalog[0], requested);
    assert.ok(html.includes(`aria-label="${label}" aria-pressed="true"`));
    assert.ok(html.includes(`<div class="g-main"><img src="${image}"`));
    assert.ok(html.includes(`<div class="m-gal scroller"><div class="m-slide"><img src="${image}"`));
  }
});

test("gallery color changes prioritize the matching image and preserve other photos without duplicates", () => {
  const p = picturedCatalog[0];
  assert.equal(productSelection.productGalleryImages(p, "white")[0], "/white-l.jpg");
  assert.equal(productSelection.productGalleryImages(p, "navy")[0], "/navy-m.jpg");
  const gallery = productSelection.productGalleryImages({ ...p, imgs: ["/white-l.jpg", "/default.jpg"] }, "white");
  assert.equal(gallery.filter((src) => src === "/white-l.jpg").length, 1);
  assert.ok(gallery.includes("/default.jpg"));
  assert.ok(gallery.includes("/navy-m.jpg"));
});

test("unknown URL colors fall back safely and a missing color photo uses the main image", () => {
  const p = picturedCatalog[0];
  assert.equal(productSelection.productColorIndex(p, "unknown"), 0);
  assert.equal(productSelection.productColorIndex(p, "לבן"), 1);
  assert.equal(productSelection.productColorIndex(p, "כחול כהה"), 0);
  assert.equal(productSelection.productColorIndex(p, undefined), 0);
  const noPhoto = { ...p, choices: p.choices.map((choice) => ({ ...choice, image: choice.color === "white" ? undefined : choice.image })) };
  const html = renderProduct(noPhoto, "white");
  assert.match(html, /aria-label="לבן" aria-pressed="true"/);
  assert.match(html, /<div class="g-main"><img src="\/default.jpg"/);
  assert.match(renderProduct(p, "unknown"), /aria-label="כחול כהה" aria-pressed="true"/);
});

test("product route forwards the color query for initial rendering, ignoring repeated parameters", async () => {
  const { default: Page } = load("app/p/[id]/page.tsx", {
    "next/navigation": { notFound: () => { throw new Error("not found"); } },
    "@/components/ProductView": { ProductView: () => null },
    "@/lib/shopify/load-catalog": { loadShopCatalog: async () => ({ products: picturedCatalog }) },
  });
  for (const color of ["white", "לבן", undefined, ["white", "navy"]]) {
    const requestedSize = Array.isArray(color) ? ["M", "L"] : "L";
    const element = await Page({ params: Promise.resolve({ id: "variants" }), searchParams: Promise.resolve({ color, size: requestedSize }) });
    assert.equal(element.props.id, "variants");
    assert.equal(element.props.initialColor, typeof color === "string" ? color : undefined);
    assert.equal(element.props.initialSize, typeof requestedSize === "string" ? requestedSize : undefined);
  }
});

test("size-only and multiple filters carry a matching color-size pair into both product links", () => {
  for (const filters of [{ sizes: ["L"] }, { colors: ["navy", "white"], sizes: ["L", "2XL"] }]) {
    const { html } = renderCategory("Shirts", filters, picturedCatalog);
    assert.equal((html.match(/href="\/p\/variants\?color=white&amp;size=L"/g) || []).length, 2);
  }
  const legacy = variantFilters.categoryProductSelection(products[0], { ...emptyFilters, sizes: ["2XL"] });
  assert.equal(legacy.size, "XXL");
  assert.equal(legacy.color, "navy");
  const noColor = variantFilters.categoryProductSelection({ ...products[0], colors: [] }, { ...emptyFilters, sizes: ["2XL"] });
  assert.equal(noColor.size, "XXL");
  assert.equal(noColor.color, undefined);
});

test("product preselects the requested available size, including aliases and size-only links", () => {
  for (const color of ["white", undefined]) {
    const html = renderProduct(picturedCatalog[0], color, "L");
    assert.match(html, /aria-label="לבן" aria-pressed="true"/);
    assert.match(html, /aria-pressed="true" class="size on ">L<\/button>/);
  }
  const available = { ...picturedCatalog[0], choices: picturedCatalog[0].choices.map((choice) => ({ ...choice, available: true })) };
  assert.match(renderProduct(available, "white", "2XL"), /aria-pressed="true" class="size on ">2XL<\/button>/);
  for (const [color, size] of [["navy", "L"], ["white", "2XL"], ["white", "unknown"]]) {
    assert.doesNotMatch(renderProduct(picturedCatalog[0], color, size), /class="size on /);
  }
});

test("bundle main-product image follows the selected color while accessory images stay intact", () => {
  const accessory = { ...products[0], id: "hat", name: "Hat", imgs: ["/hat.jpg"] };
  for (const [color, image] of [["white", "/white-l.jpg"], ["navy", "/navy-m.jpg"]]) {
    const html = renderProduct(picturedCatalog[0], color, undefined, [accessory]);
    const bundleImages = [...html.matchAll(/<div class="mini-ph"><img src="([^"]+)"/g)].map((match) => match[1]);
    assert.deepEqual(bundleImages, [image, "/hat.jpg"]);
  }
});

function renderQuick(product, qColor, qSize) {
  const { Overlays } = load("components/Overlays.tsx", {
    "next/link": ({ children, ...props }) => React.createElement("a", props, children),
    "next/navigation": { usePathname: () => "/c/work" },
    "@/lib/catalog": { ...colors, FREE_SHIPPING: 299, phOf: () => "" },
    "@/lib/catalog-context": { useCatalog: () => ({ product: () => product, products: [product], categories: [], category: () => undefined }) },
    "@/lib/category-filters": variantFilters,
    "@/lib/product-selection": productSelection,
    "@/lib/sizes": sizes,
    "@/lib/pricing": { fmt: String, priceFor: (p, qty) => p.price * qty, cartMath: () => ({ byP: {}, total: 0 }) },
    "@/lib/store": { useStore: () => ({ cart: [], sheet: "quick", quickId: product.id, qColor, qSize }) },
    "./icons": { IconCheck: () => null, IconSearch: () => null },
  });
  return renderToStaticMarkup(React.createElement(Overlays)).match(/<section class="sheet quick-sheet"[\s\S]*?<\/section>/)[0];
}

test("quick sheet shows the selected color, size, and matching variant image", () => {
  for (const [color, size, label, image] of [[0, "M", "כחול כהה", "/navy-m.jpg"], [1, "L", "לבן", "/white-l.jpg"]]) {
    const html = renderQuick(picturedCatalog[0], color, size);
    assert.ok(html.includes(`aria-label="${label}" aria-pressed="true"`));
    assert.ok(html.includes(`aria-pressed="true" class="size on">${size}</button>`));
    assert.ok(html.includes(`<img src="${image}"`));
    assert.doesNotMatch(html, />בחרו מידה<\/button>/);
  }
});

test("quick sheet keeps unavailable sizes unselected and falls back when color photos are missing", () => {
  const invalid = renderQuick(picturedCatalog[0], 0, "L");
  assert.doesNotMatch(invalid, /class="size on"/);
  assert.match(invalid, />בחרו מידה<\/button>/);
  const noPhoto = { ...picturedCatalog[0], choices: picturedCatalog[0].choices.map((choice) => ({ ...choice, image: undefined })) };
  assert.match(renderQuick(noPhoto, 1, "L"), /<img src="\/default.jpg"/);
});

test("cart photos follow each line's variant, including unavailable variants and normalized aliases", () => {
  const p = picturedCatalog[0];
  const image = (line) => productSelection.cartProductImage(p, line);
  assert.equal(image({ color: "navy", size: "M", variantId: "navy-m" }), "/navy-m.jpg");
  assert.equal(image({ color: "white", size: "XXL", variantId: "white-xxl" }), "/white-xxl.jpg");
  assert.equal(image({ color: "לבן", size: "2XL" }), "/white-xxl.jpg");
  assert.equal(image({ color: "white", size: "L", variantId: "navy-m" }), "/white-l.jpg");
  assert.equal(image({ color: "white", size: "removed-size" }), "/white-l.jpg");
  assert.equal(image({ color: "red", size: "M" }), "/default.jpg");
  assert.equal(productSelection.cartProductImage({ ...p, choices: [] }, { color: "white", size: "L" }), "/default.jpg");
  assert.equal(productSelection.cartProductImage({ ...p, choices: [], imgs: [] }, { color: "white", size: "L" }), undefined);
});

test("cart drawer and checkout show separate color photos for multiple lines of the same product", () => {
  const p = picturedCatalog[0];
  const cart = [
    { key: "navy", pid: p.id, color: "navy", size: "M", variantId: "navy-m", qty: 1 },
    { key: "white", pid: p.id, color: "white", size: "L", variantId: "white-l", qty: 2 },
    { key: "white-xxl", pid: p.id, color: "לבן", size: "2XL", qty: 1 },
  ];
  const dependencies = {
    "next/link": ({ children, ...props }) => React.createElement("a", props, children),
    "next/navigation": { usePathname: () => "/c/work" },
    "@/app/actions/shopify-checkout": { beginShopifyCheckout: () => { throw new Error("Checkout must not run during render"); } },
    "@/lib/catalog": { ...colors, FREE_SHIPPING: 299, phOf: () => "" },
    "@/lib/catalog-context": { useCatalog: () => ({ product: () => p, products: [p], categories: [], category: () => undefined }) },
    "@/lib/category-filters": variantFilters,
    "@/lib/product-selection": productSelection,
    "@/lib/sizes": sizes,
    "@/lib/pricing": { fmt: String, priceFor: (p, qty) => p.price * qty, cartMath: () => ({ byP: {}, total: 200, count: 4, savings: 0 }) },
    "@/lib/store": { useStore: () => ({ cart, cartOpen: true }) },
    "./icons": { IconCheck: () => null, IconSearch: () => null },
  };
  const { Overlays } = load("components/Overlays.tsx", dependencies);
  const { CheckoutView } = load("components/CheckoutView.tsx", dependencies);
  const drawer = renderToStaticMarkup(React.createElement(Overlays)).match(/<aside class="drawer cart[\s\S]*?<\/aside>/)[0];
  const checkout = renderToStaticMarkup(React.createElement(CheckoutView)).match(/<aside class="aside-box"[\s\S]*?<\/aside>/)[0];
  for (const html of [drawer, checkout]) {
    assert.deepEqual([...html.matchAll(/<img src="([^"]+)"/g)].map((match) => match[1]), ["/navy-m.jpg", "/white-l.jpg", "/white-xxl.jpg"]);
  }
});

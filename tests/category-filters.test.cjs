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
    (name) => Object.hasOwn(dependencies, name) ? dependencies[name]
      : name === "./CartItem" ? load("components/CartItem.tsx", dependencies)
      : name === "./CartContents" ? load("components/CartContents.tsx", dependencies)
      : name === "./CartOfferCompletion" ? load("components/CartOfferCompletion.tsx", dependencies)
      : name === "@/lib/offer-completion-price" ? load("lib/offer-completion-price.ts")
      : name === "@/lib/cart-unit-presets" ? load("lib/cart-unit-presets.ts", { "./colors": colors, "./sizes": sizes, "./quantity-selection": load("lib/quantity-selection.ts", { "./sizes": sizes }) })
      : name === "@/lib/use-cart-quote" ? { useCartQuote: () => ({ pending: false }) }
      : name === "@/lib/cart-groups" ? load("lib/cart-groups.ts", { "./quantity-offers": load("lib/quantity-offers.ts") })
      : name === "./CheckoutButton" ? load("components/CheckoutButton.tsx", { "@/app/actions/shopify-checkout": { beginShopifyCheckout: () => { throw new Error("Unexpected checkout during rendering"); } }, ...dependencies })
      : name === "./ProductImage" ? load("components/ProductImage.tsx", dependencies)
      : name === "./MobileFilterSheet" ? load("components/MobileFilterSheet.tsx", dependencies)
      : name === "./CategoryScroller" ? load("components/CategoryScroller.tsx", dependencies)
      : name === "./CategorySorting" ? load("components/CategorySorting.tsx", dependencies)
      : name === "./ProductListProgress" ? load("components/ProductListProgress.tsx", dependencies)
      : name === "@/lib/page-scroll-lock" ? load("lib/page-scroll-lock.ts")
      : name === "./ProductBrand" ? load("components/ProductBrand.tsx", { "@/lib/catalog-context": { useCatalog: () => ({ brand: brandByName }) } })
      : name === "@/lib/brands" ? load("lib/brands.ts")
      : name === "@/lib/product-search" ? load("lib/product-search.ts")
      : name === "./QuantityUnitPicker" ? load("components/QuantityUnitPicker.tsx", dependencies)
      : name === "./UnitSwatchSelect" ? load("components/UnitSwatchSelect.tsx", dependencies)
      : name === "@/lib/quantity-selection" ? load("lib/quantity-selection.ts", { "./sizes": sizes })
      : name === "@/lib/quantity-offers" ? load("lib/quantity-offers.ts")
      : name === "@/lib/checkout-return" ? load("lib/checkout-return.ts")
      : name === "@/lib/image-sources" ? load("lib/image-sources.ts") : require(name), module, module.exports,
  );
  return module.exports;
}

const colors = load("lib/colors.ts");
const { brandByName } = load("lib/brands.ts");
const colorFamilies = load("lib/color-families.ts", { "./colors": colors });
const placement = load("lib/category-placement.ts");
const storefrontCatalog = load("lib/catalog.ts", { "./colors": colors, "./category-placement": placement });
const sizes = load("lib/sizes.ts");
const variantFilters = load("lib/category-filters.ts", { "./colors": colors, "./sizes": sizes, "./color-families": colorFamilies });
const productSelection = load("lib/product-selection.ts", { "./colors": colors, "./sizes": sizes, "./category-filters": variantFilters });
const { ProductTile } = load("components/ProductTile.tsx", {
  "@/lib/product-tile-photos": load("lib/product-tile-photos.ts"),
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

function renderCategory(sub, filters = {}, catalog = products, brand, editing = false, colorMappings) {
  const category = { id: "work", name: "Work", subs: ["Shirts", "Pants", "Empty"] };
  let historyArgs;
  const { CategoryView } = load("components/CategoryView.tsx", {
    "next/link": ({ children, ...props }) => React.createElement("a", props, children),
    "next/navigation": { useRouter: () => ({}), useSearchParams: () => new URLSearchParams(sub ? { sub } : {}) },
    "@/lib/catalog": storefrontCatalog,
    "@/lib/catalog-context": { useCatalog: () => ({ category: () => category, categories: [category], products: catalog,
      colorMappings, productsInCategory: (id) => catalog.filter((p) => p.cat === id) }) },
    "@/lib/color-families": colorFamilies,
    "@/lib/category-filters": variantFilters,
    "@/lib/category-sorting": load("lib/category-sorting.ts", { "./catalog": storefrontCatalog, "./category-placement": placement }),
    "@/lib/colors": colors,
    "@/lib/sizes": sizes,
    "@/lib/category-history": { CATEGORY_PAGE_SIZE: 8, useCategoryHistory: (...args) => { historyArgs = args; return { filters: { ...emptyFilters, ...filters }, sort: "pop", shown: 8, restoring: false }; } },
    "@/lib/pricing": { fmt: String },
    "@/lib/store": { useScrollLock: () => {} },
    "./icons": { IconFilter: () => null, IconPencil: () => null },
    ...(editing && { "./CategorySorting": {
      useCategorySorting: () => ({
        editing: true,
        access: { enabled: true, categories: [{ ...category, subs: [...category.subs, "Admin only"] }], lastEdit: null },
      }),
      SortProductCard: ({ children }) => children,
    } }),
    "./ProductTile": { ProductTile: (props) => React.createElement("div", { "data-product": props.p.id }, React.createElement(ProductTile, props)) },
  });
  const View = brand ? load("components/BrandView.tsx", { "./CategoryView": { CategoryView } }).BrandView : CategoryView;
  const html = renderToStaticMarkup(React.createElement(View, brand ? { brand } : { catId: "work" }));
  return { html, sidebar: html.match(/<aside\b[^>]*>([\s\S]*?)<\/aside>/)[1], historyArgs };
}

test("brand listings share the category layout while scoping products and facets across categories", () => {
  const brand = { id: "work", name: "Target" };
  const catalog = products.map((p, i) => ({ ...p, brand: i === 1 ? "Other" : "Target" }));
  const { html, sidebar, historyArgs } = renderCategory(null, { brands: ["Other"] }, catalog, brand);
  assert.match(html, /class="cat-layout"/);
  assert.match(html, /class="filters desk"/);
  for (const id of ["shirt", "shared", "shoe"]) assert.ok(html.includes(`data-product="${id}"`));
  assert.doesNotMatch(html, /data-product="pants"/);
  assert.match(sidebar, />46<\/button>/);
  assert.doesNotMatch(sidebar, />42<\/button>|>Other<\/button>/);
  assert.deepEqual(historyArgs, ["brand:work", null, "/brands/work"]);
  assert.deepEqual(renderCategory(null).historyArgs, ["work", null, "/c/work"]);
  assert.match(html, /href="\/brands"/);
  const sub = renderCategory("Uniforms", {}, catalog, brand);
  assert.match(sub.html, /data-product="shared"/);
  assert.doesNotMatch(sub.html, /data-product="shirt"|data-product="shoe"/);
  assert.match(sub.html, /href="\/brands\/work"/);
});

test("subcategory filters contain only its products, including secondary subcategory membership", () => {
  const { html, sidebar } = renderCategory("Shirts");
  assert.doesNotMatch(html, /class="sub-navigation"/);
  assert.match(html, /<a href="\/c\/work">Work<\/a><span>\/<\/span><span class="now">Shirts<\/span>/);
  assert.match(sidebar, /aria-label="כחול"/);
  assert.match(sidebar, /aria-label="לבן"/);
  assert.match(sidebar, />2XL<\/button>/);
  assert.match(sidebar, />M<\/button>/);
  assert.doesNotMatch(sidebar, /בז׳|>42<\/button>|אדום|>46<\/button>/);
  assert.match(html, /data-product="shirt"/);
  assert.match(html, /data-product="shared"/);
  assert.doesNotMatch(html, /data-product="pants"|data-product="shoe"/);
});

test("category navigation follows the published catalog in browse and sorting modes", () => {
  for (const editing of [false, true]) {
    const { html } = renderCategory(null, {}, products, undefined, editing);
    const navigation = html.match(/class="sub-row scroller"[^>]*>(.*?)<\/div>/)?.[1] ?? "";
    for (const name of ["Shirts", "Pants", "Empty"]) assert.match(navigation, new RegExp(`>${name}<`));
    assert.doesNotMatch(navigation, /Admin only|Uniforms/);
  }
  const { html } = renderCategory("Shirts", {}, products, undefined, true);
  assert.match(html, /סיום סידור/);
  assert.doesNotMatch(html, /class="sub-navigation"/);
});

test("brand aliases share one filter and restored aliases still match all corresponding products", () => {
  const catalog = [
    { ...products[0], id: 'worker-a', brand: 'WORKER' },
    { ...products[0], id: 'worker-b', brand: ' worker ' },
    { ...products[0], id: 'supplier-only', brand: 'worker.co.il' },
    { ...products[0], id: 'redback-a', brand: 'REDBACK' },
    { ...products[0], id: 'redback-b', brand: 'redback.co.il' },
  ];
  const { sidebar } = renderCategory(null, {}, catalog);
  assert.equal((sidebar.match(/WORKER/g) || []).length, 1);
  assert.equal((sidebar.match(/Redback/g) || []).length, 1);
  assert.doesNotMatch(sidebar, /worker\.co\.il|redback\.co\.il/);
  const worker = renderCategory(null, { brands: [' worker ', 'WORKER'] }, catalog).html;
  assert.match(worker, /data-product="worker-a"/);
  assert.match(worker, /data-product="worker-b"/);
  assert.doesNotMatch(worker, /data-product="supplier-only"|data-product="redback/);
  const redback = renderCategory(null, { brands: ['redback.co.il'] }, catalog).html;
  assert.match(redback, /data-product="redback-a"/);
  assert.match(redback, /data-product="redback-b"/);
  assert.doesNotMatch(redback, /data-product="worker/);
  assert.match(renderCategory(null, { brands: ['worker.co.il'] }, catalog).html, /data-product="supplier-only"/);
});

test("all-category filters include sibling products but exclude other categories", () => {
  const { sidebar } = renderCategory(null);
  assert.match(sidebar, /בז׳/);
  assert.match(sidebar, />42<\/button>/);
  assert.doesNotMatch(sidebar, /אדום|>46<\/button>/);
  const pants = renderCategory("Pants").sidebar;
  assert.match(pants, /בז׳/);
  assert.doesNotMatch(pants, /כחול|>2XL<\/button>|>M<\/button>/);
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

test("old subcategory links redirect to the current label and preserve other query values", async () => {
  const redirects = [];
  const { default: CategoryPage } = load("app/c/[cat]/page.tsx", {
    "next/navigation": { permanentRedirect: destination => { redirects.push(destination); throw new Error("redirect"); } },
    "@/lib/category-placement": placement,
    "@/components/CategoryView": {},
    "@/lib/shopify/storefront-catalog": {},
  });
  for (const { parentId, sub, previous } of [placement.winterOuterwear, placement.bagsAndWallets, placement.socksAndUnderwear]) {
    for (const legacy of previous) {
      await assert.rejects(CategoryPage({
        params: Promise.resolve({ cat: parentId }), searchParams: Promise.resolve({ sub: legacy, filter: ["a", "b"] }),
      }), /redirect/);
      const destination = new URL(redirects.at(-1), "https://example.com");
      assert.equal(destination.pathname, `/c/${parentId}`);
      assert.equal(destination.searchParams.get("sub"), sub);
      assert.deepEqual(destination.searchParams.getAll("filter"), ["a", "b"]);
    }
  }
  const { previousParent, parentId, sub } = placement.reflectiveVests;
  await assert.rejects(CategoryPage({
    params: Promise.resolve({ cat: previousParent }), searchParams: Promise.resolve({ sub, filter: ["a", "b"] }),
  }), /redirect/);
  const destination = new URL(redirects.at(-1), "https://example.com");
  assert.equal(destination.pathname, `/c/${parentId}`);
  assert.equal(destination.searchParams.get("sub"), sub);
  assert.deepEqual(destination.searchParams.getAll("filter"), ["a", "b"]);
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
  assert.doesNotMatch(sidebar, /aria-label="כחול"/);
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
  assert.doesNotMatch(size, /aria-label="כחול"/);
});

test("color and size options respect the other active filters", () => {
  const { sidebar } = renderCategory("Shirts", { max: 55 });
  assert.match(sidebar, /aria-label="כחול"/);
  assert.doesNotMatch(sidebar, /aria-label="לבן"|>M<\/button>/);
});

test("the category filter groups shades and puts unmapped colors under additional colors until approved", () => {
  const base = products[0];
  const catalog = [
    { ...base, id: "light", colors: ["תכלת"] },
    { ...base, id: "navy", colors: ["navy"] },
    { ...base, id: "unmapped", colors: ["Supply 041"] },
  ];
  const { sidebar } = renderCategory("Shirts", {}, catalog);
  assert.equal((sidebar.match(/aria-label="כחול"/g) || []).length, 1);
  assert.doesNotMatch(sidebar, /aria-label="תכלת"|aria-label="כחול כהה"/);
  assert.match(sidebar, /<details class="filter-colors-additional"><summary>צבעים נוספים<\/summary>.*Supply 041/);
  const blue = renderCategory("Shirts", { colors: ["family:blue"] }, catalog).html;
  assert.match(blue, /data-product="light"/);
  assert.match(blue, /data-product="navy"/);
  assert.doesNotMatch(blue, /data-product="unmapped"|>family:blue/);
  const additional = renderCategory("Shirts", { colors: ["Supply 041"] }, catalog).html;
  assert.match(additional, /data-product="unmapped"/);
  assert.doesNotMatch(additional, /data-product="light"|data-product="navy"/);

  const mapped = renderCategory("Shirts", { colors: ["family:green"] }, catalog, undefined, false, {
    "supply 041": { family: "green", swatch: "#47623F" },
  });
  assert.match(mapped.sidebar, /aria-label="ירוק"/);
  assert.doesNotMatch(mapped.sidebar, /צבעים נוספים/);
  assert.match(mapped.html, /href="\/p\/unmapped\?color=Supply\+041"/);
});

test("a family uses the shade that matches the selected size and its photo", () => {
  const { categoryProductSelection } = variantFilters;
  const product = {
    ...variantCatalog[0], imgs: ["/default.jpg"], colors: ["navy", "תכלת"],
    choices: [
      { ...variantCatalog[0].choices[0], image: "/navy-m.jpg" },
      { ...variantCatalog[0].choices[1], color: "תכלת" },
      { ...variantCatalog[0].choices[0], color: "תכלת", image: "/light-m.jpg" },
    ],
  };
  const filters = { ...emptyFilters, colors: ["family:blue"], sizes: ["L"], stock: true };
  assert.deepEqual(categoryProductSelection(product, filters), { color: "תכלת", size: "L", image: "/light-m.jpg" });
  product.choices.pop();
  assert.deepEqual(categoryProductSelection(product, filters), { color: "תכלת", size: "L", image: "/default.jpg" });
});

const picturedCatalog = [{
  ...variantCatalog[0], imgs: ["/default.jpg"],
  choices: variantCatalog[0].choices.map((choice) => ({ ...choice, image: `/${choice.id}.jpg` })),
}];

test("brand listings keep variant-aware filtering, responsive images and the category batch size", () => {
  const brand = { id: "target", name: "Target" };
  const catalog = Array.from({ length: 12 }, (_, i) => ({ ...picturedCatalog[0], id: `brand-${i}`, brand: "Target" }));
  catalog.push({ ...picturedCatalog[0], id: "other-brand", brand: "Other" });
  const { html } = renderCategory("Shirts", { colors: ["white"], sizes: ["L"], stock: true }, catalog, brand);
  assert.equal((html.match(/data-product=/g) || []).length, 8);
  assert.match(html, /מוצגים 8 מתוך 12/);
  assert.doesNotMatch(html, /data-product="other-brand"/);
  assert.match(html, /src="\/white-l.jpg"/);
  assert.equal((html.match(/loading="eager"/g) || []).length, 2);
  assert.equal((html.match(/loading="lazy"/g) || []).length, 6);
  assert.match(html, /href="\/p\/brand-0\?color=white&amp;size=L"/);
  const invalid = renderCategory(null, { colors: ["navy"], sizes: ["L"] }, catalog, brand);
  assert.match(invalid.html, /אין התאמות/);
  assert.doesNotMatch(invalid.html, /data-product=/);
});

test("category cards show the chosen color photo and restore the default after clearing", () => {
  const navy = renderCategory("Shirts", { colors: ["כחול כהה"] }, picturedCatalog).html;
  assert.match(navy, /<img[^>]* src="\/navy-m.jpg"/);
  assert.doesNotMatch(navy, /<img[^>]* src="\/default.jpg"/);
  const white = renderCategory("Shirts", { colors: ["לבן"], sizes: ["2XL"] }, picturedCatalog).html;
  assert.match(white, /<img[^>]* src="\/white-xxl.jpg"/);
  const cleared = renderCategory("Shirts", {}, picturedCatalog).html;
  assert.match(cleared, /<img[^>]* src="\/default.jpg"/);
  // Product tiles elsewhere retain their default image without filter props.
  assert.match(renderToStaticMarkup(React.createElement(ProductTile, { p: picturedCatalog[0] })), /<img[^>]* src="\/default.jpg"/);
});

test("only product cards with reviewed cropping opt in to full photos", () => {
  const shoe = { ...picturedCatalog[0], cat: "shoes", id: "ahim-88aed4bee3453b51-6627" };
  const html = renderToStaticMarkup(React.createElement(ProductTile, { p: shoe, imageSrc: "/variant.jpg" }));
  assert.match(html, /class="pt-media"[^>]* data-image-fit="contain"/);
  assert.match(html, /<img[^>]* src="\/variant.jpg"/);
  const other = renderToStaticMarkup(React.createElement(ProductTile, { p: { ...shoe, id: "other-shoe" } }));
  assert.doesNotMatch(other, /data-image-fit/);
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
  assert.match(html, /<img[^>]* src="\/white-l.jpg"/);
  const plain = renderCategory("Shirts", {}, picturedCatalog).html;
  assert.equal((plain.match(/href="\/p\/variants"/g) || []).length, 2);
  assert.doesNotMatch(plain, /\?color=/);
});

function renderProduct(product, initialColor, initialSize, extras = [], fromQuantityOffer = false, bundles = []) {
  const { ProductView } = load("components/ProductView.tsx", {
    "next/link": ({ children, ...props }) => React.createElement("a", props, children),
    "next/navigation": { useRouter: () => ({}) },
    "@/lib/catalog": { ...colors, FREE_SHIPPING: 299, phOf: () => "" },
    "@/lib/catalog-context": { useCatalog: () => ({ product: (id) => [product, ...extras].find((p) => p.id === id), category: () => ({ name: "Work" }), products: [product, ...extras], brand: brandByName }) },
    "@/lib/colors": colors,
    "@/lib/product-selection": productSelection,
    "@/lib/quantity-offers": load("lib/quantity-offers.ts"),
    "@/lib/use-cart-quote": { useCartQuote: () => ({ pending: false }) },
    "@/lib/product-recommendations": { complementaryAccessories: () => extras, similarProducts: () => [] },
    "@/lib/product-sets": load("lib/product-sets.ts", { "./product-recommendations": load("lib/product-recommendations.ts") }),
    "@/lib/sizes": sizes,
    "@/lib/pricing": { fmt: String, priceFor: (p, qty) => p.price * qty, saleBadge: () => "Sale" },
    "@/lib/store": { useStore: () => ({ cart: [] }), useScrollLock: () => {} },
    "./icons": { IconCheck: () => null, IconFwd: () => null, IconPackages: () => null, IconPhone: () => null, IconPin: () => null, IconTruck: () => null },
    "./ProductTile": { ProductTile },
    "./ProductReviews": { ProductReviews: () => null, ProductReviewsLink: () => null, reviewSummary: () => ({}) },
  });
  return renderToStaticMarkup(React.createElement(ProductView, { id: product.id, initialColor, initialSize, fromQuantityOffer, bundles }));
}

test("a linked pack is a product link and leaves the base product quantity at one", () => {
  const html = renderProduct(picturedCatalog[0], "white", "L", [], false, [
    { id: "linked", name: "מארז זוגי", quantity: 2, total: 95, productId: "sweatshirt-pair", bestValue: true },
  ]);
  assert.match(html, /<a class="pack pack-product" href="\/p\/sweatshirt-pair">.*?מארז זוגי.*?95.*?<\/a>/);
  assert.match(html, /class="badge product-pack-best-value">הכי משתלם<\/span>/);
  assert.match(html, /class="qty"[\s\S]*?<span>1<\/span>/);
  assert.doesNotMatch(html, /מידה ליחידה 2/);
});

test("product purchase controls stay inline and stock reflects available variants", () => {
  const available = renderProduct(picturedCatalog[0], "white", "L");
  assert.match(available, /class="btn product-add-btn"/);
  assert.doesNotMatch(available, /buybar|has-buybar|btn desk/);
  assert.match(available, /המוצר הזה זמין במלאי/);
  const unavailable = renderProduct({ ...picturedCatalog[0], choices: picturedCatalog[0].choices.map(choice => ({ ...choice, available: false })) });
  assert.match(unavailable, /class="btn product-add-btn" disabled=""/);
  assert.match(unavailable, /המוצר אינו זמין במלאי/);
  assert.doesNotMatch(unavailable, /המוצר הזה זמין במלאי/);
});

test("entering a quantity offer preselects its quantity while a packed product stays at one", () => {
  const shirt = { ...picturedCatalog[0], name: "חולצת אוברסייז - 2 חולצות ב-140 ש״ח", price: 89 };
  assert.match(renderProduct(shirt, undefined, undefined, [], true), /class="qty"[\s\S]*?<span>2<\/span>/);
  const mixed = renderProduct(shirt, undefined, undefined, [], true);
  assert.match(mixed, /aria-label="צבע ליחידה 1"/);
  assert.match(mixed, /role="combobox" aria-label="צבע ליחידה 1"[^>]*><span aria-hidden="true" class="swatch-dot" style="background:[^"]+"/);
  assert.match(mixed, /aria-label="מידה ליחידה 2"/);
  assert.match(mixed, /בחרו מידה לכל יחידה/);
  assert.equal((mixed.match(/<fieldset/g) || []).length, 2);
  assert.match(renderProduct(shirt), /class="qty"[\s\S]*?<span>1<\/span>/);
  const pack = { ...shirt, name: "מארז שתי חולצות בייסיק", price: 99, was: 119 };
  assert.match(renderProduct(pack, undefined, undefined, [], true), /class="qty"[\s\S]*?<span>1<\/span>/);
  assert.doesNotMatch(renderProduct(pack, undefined, undefined, [], true), /צבע ליחידה/);
});

test("a bundle variant shows its mapped color in the menu and after selection, and skips sold-out variants", () => {
  let active = null;
  const select = load("components/UnitSwatchSelect.tsx", { react: {
    useEffect() {}, useId: () => "swatches", useRef: value => ({ current: value }),
    useState: () => [active, value => { active = value; }],
  } }).UnitSwatchSelect;
  const choices = [
    { id: "gray", color: "אפור", size: "M", available: true, optionsLabel: "אפור · M · כותנה" },
    { id: "navy", color: "navy", size: "M", available: false, optionsLabel: "כחול כהה · M · כותנה" },
    { id: "custom", color: "גוון מיוחד", size: "L", available: true, optionsLabel: "גוון מיוחד · L · כותנה" },
  ];
  const { QuantityUnitPicker } = load("components/QuantityUnitPicker.tsx", {
    "@/lib/catalog": colors, "@/lib/sizes": sizes, "./UnitSwatchSelect": { UnitSwatchSelect: select },
    "@/lib/catalog-context": { useCatalog: () => ({ colorMappings: { "גוון מיוחד": { family: "blue", swatch: "#123456" } } }) },
  });
  let picked = choices[0];
  function render() {
    const tree = QuantityUnitPicker({ product: { choices, colors: choices.map(choice => choice.color) },
      rows: [{ variant: picked, valid: true }], showErrors: false, selectByVariant: true,
      onChange: (unit, selection) => { assert.equal(unit, 0); picked = choices.find(choice => choice.id === selection.variantId); },
    });
    const field = tree.props.children[2][0].props.children[1].props.children;
    return select(field.props);
  }
  const trigger = () => render().props.children[1];
  trigger().props.onClick();
  const menu = render().props.children[2];
  assert.deepEqual(menu.props.children.map(option => option.props.children[0].props.style.background),
    [colors.swatchColor("אפור"), colors.swatchColor("navy"), "#123456"]);
  assert.equal(menu.props.children[1].props["aria-disabled"], true);
  menu.props.children[1].props.onClick();
  assert.equal(picked.id, "gray");
  for (const key of ["ArrowDown", "Enter"]) trigger().props.onKeyDown({ key, preventDefault() {} });
  assert.equal(picked.id, "custom");
  assert.equal(trigger().props["aria-expanded"], false);
  assert.equal(trigger().props.children[0].props.style.background, "#123456");
});

test("product opens with the linked color selected and its photo first in both galleries", () => {
  for (const [requested, label, image] of [["לבן", "לבן", "/white-l.jpg"], ["navy", "כחול כהה", "/navy-m.jpg"]]) {
    const html = renderProduct(picturedCatalog[0], requested);
    assert.ok(html.includes(`aria-label="${label}" aria-pressed="true"`));
    assert.equal(html.match(/<div class="g-main"><img[^>]* src="([^"]+)"/)[1], image);
    assert.equal(html.match(/<div class="m-gal scroller"><div class="m-slide"><img[^>]* src="([^"]+)"/)[1], image);
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
  assert.match(html, /<div class="g-main"><img[^>]* src="\/default.jpg"/);
  assert.match(renderProduct(p, "unknown"), /aria-label="כחול כהה" aria-pressed="true"/);
});

test("product route forwards the color query for initial rendering, ignoring repeated parameters", async () => {
  const { default: Page } = load("app/p/[id]/page.tsx", {
    "next/navigation": { notFound: () => { throw new Error("not found"); } },
    "@/components/ProductView": { ProductView: () => null },
    "@/lib/admin/models": load("lib/admin/models.ts"),
    "@/lib/admin/bundle-catalog": { managedBundleProducts: async () => [] },
    "@/lib/admin/storage": { readAdminStore: async () => ({ reviews: [], bundles: [], offers: [], sets: [] }) },
    "@/lib/admin/reviews": { publishedReviews: async () => [] },
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

test("product route exposes only its published bundle tiers without exposing discount codes", async () => {
  const pack = { ...picturedCatalog[0], id: "sweatshirt-pair", price: 95 };
  const { default: Page } = load("app/p/[id]/page.tsx", {
    "next/navigation": { notFound: () => { throw new Error("not found"); }, redirect: (destination) => { throw new Error(destination); } },
    "@/components/ProductView": { ProductView: () => null },
    "@/lib/admin/models": load("lib/admin/models.ts"),
    "@/lib/admin/bundle-catalog": { managedBundleProducts: async () => [{ id: "bundle-cart-managed" }, { id: "bundle-cart-offer" }] },
    "@/lib/admin/reviews": { publishedReviews: async () => [] },
    "@/lib/admin/storage": { readAdminStore: async () => ({ reviews: [], sets: [], bundles: [
      { id: "two", name: "זוג", active: true, total: 120, items: [["variants", 2]], code: "PRIVATE" },
      { id: "three", name: "שלישייה", active: true, total: 160, items: [["variants", 3]] },
      { id: "draft", name: "טיוטה", active: false, total: 200, items: [["variants", 4]] },
      { id: "other", active: true, total: 200, items: [["other", 4]] },
      { id: "old", active: true, items: [["variants", 2], ["other", 1]] },
      { id: "missing", active: true, items: [["variants", 6]], bundleProductId: "missing" },
      { id: "linked", name: "מארז זוגי", active: true, total: 90, items: [["variants", 2]], bundleProductId: pack.id },
      { id: "managed", name: "מארז שלישייה", active: true, total: 99, items: [["variants", 3]], sourceVariantIds: ["private"], bestValue: true, mixedUnits: true },
      { id: "pending", name: "ממתין", active: true, total: 119, items: [["variants", 4]], sourceVariantIds: ["private"] },
    ], offers: [
      { id: "offer", productId: "variants", active: true, total: 75, quantity: 3, sourceVariantIds: ["private"] },
      { id: "draft-offer", productId: "variants", active: false, total: 42, quantity: 2, sourceVariantIds: ["private"] },
    ] }) },
    "@/lib/shopify/load-catalog": { loadShopCatalog: async () => ({ products: [...picturedCatalog, pack] }) },
  });
  const element = await Page({ params: Promise.resolve({ id: "variants" }), searchParams: Promise.resolve({ bundle: "three" }) });
  assert.equal(element.props.initialBundle, "three");
  assert.deepEqual(element.props.bundles, [
    { id: "two", name: "זוג", quantity: 2, total: 120 },
    { id: "three", name: "שלישייה", quantity: 3, total: 160 },
    { id: "linked", name: "מארז זוגי", quantity: 2, total: 95, productId: pack.id },
    { id: "managed", name: "מארז שלישייה", quantity: 3, total: 99, cartProductId: "bundle-cart-managed", bestValue: true, mixedUnits: true },
  ]);
  const offerView = await Page({ params: Promise.resolve({ id: "variants" }), searchParams: Promise.resolve({ bundle: "offer" }) });
  assert.deepEqual(offerView.props.bundles, [
    { id: "offer", name: "3 יחידות", quantity: 3, total: 75, cartProductId: "bundle-cart-offer", quantityOffer: true, mixedUnits: true },
  ]);
  await assert.rejects(Page({ params: Promise.resolve({ id: "variants" }), searchParams: Promise.resolve({ bundle: "linked" }) }), /\/p\/sweatshirt-pair/);
});

test("quantity offers page links only verified managed offers to the selected pack", () => {
  const product = { ...picturedCatalog[0], name: "Shirt", price: 49, deal: [2, 85] };
  const offer = { id: "offer", productId: product.id, quantity: 3, total: 120 };
  const pack = { id: "bundle-cart-offer", bundleSourceId: product.id };
  const feature = { id: "feature", productId: product.id, quantity: 2, total: 90, managed: true };
  const featurePack = { id: "bundle-cart-feature", bundleSourceId: product.id };
  function render(verified) {
    const { QuantityOffersView } = load("components/QuantityOffersView.tsx", {
      "next/link": ({ children, ...props }) => React.createElement("a", props, children),
      "@/lib/admin/models": load("lib/admin/models.ts"),
      "@/lib/catalog-context": { useCatalog: () => ({ products: [product], product: (id) => [product, ...(verified ? [pack, featurePack] : [])].find((item) => item.id === id) }) },
      "@/lib/pricing": { fmt: String },
      "@/lib/quantity-offers": load("lib/quantity-offers.ts"),
      "./ProductTile": { ProductTile }, "./icons": { IconBag: () => null },
    });
    return renderToStaticMarkup(React.createElement(QuantityOffersView, { managedOffers: [offer], featuredBundles: [feature] }));
  }
  const verified = render(true);
  assert.match(verified, /href="\/p\/variants\?bundle=offer"/);
  assert.match(verified, /href="\/p\/variants\?bundle=feature"/);
  assert.match(verified, /<bdi>120<\/bdi>/);
  assert.doesNotMatch(verified, /quantity-offer=1/);
  const unverified = render(false);
  assert.doesNotMatch(unverified, /bundle=offer/);
  assert.doesNotMatch(unverified, /bundle=feature/);
  assert.match(unverified, /quantity-offer=1/);
});

test("general offers show current product discounts without a separate quantity listing", () => {
  const discounted = { ...picturedCatalog[0], price: 49, was: 65, deal: [2, 85] };
  const quantityOnly = { ...discounted, id: "quantity-only", was: undefined };
  const { QuantityOffersView } = load("components/QuantityOffersView.tsx", {
    "next/link": ({ children, ...props }) => React.createElement("a", props, children),
    "@/lib/admin/models": load("lib/admin/models.ts"),
    "@/lib/catalog-context": { useCatalog: () => ({ products: [discounted, quantityOnly] }) },
    "@/lib/pricing": { fmt: String },
    "@/lib/quantity-offers": load("lib/quantity-offers.ts"),
    "./ProductTile": { ProductTile }, "./icons": { IconBag: () => null },
  });
  const html = renderToStaticMarkup(React.createElement(QuantityOffersView, { discountedOnly: true }));
  assert.match(html, /href="\/p\/variants"/);
  assert.doesNotMatch(html, /quantity-only|quantity-offer=1|מבצעי כמות/);
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
    const bundleImages = [...html.matchAll(/<div class="mini-ph"><img[^>]* src="([^"]+)"/g)].map((match) => match[1]);
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
    "@/lib/store": { useScrollLock: () => {}, useStore: () => ({ cart: [], pricing: { byP: {}, total: 0, savings: 0 }, cartQuote: { pending: false }, sheet: "quick", quickId: product.id, qColor, qSize }) },
    "./icons": load("components/icons.tsx"),
  });
  return renderToStaticMarkup(React.createElement(Overlays)).match(/<section class="sheet quick-sheet"[\s\S]*?<\/section>/)[0];
}

test("quick sheet shows the selected color, size, and matching variant image", () => {
  for (const [color, size, label, image] of [[0, "M", "כחול כהה", "/navy-m.jpg"], [1, "L", "לבן", "/white-l.jpg"]]) {
    const html = renderQuick(picturedCatalog[0], color, size);
    assert.ok(html.includes(`aria-label="${label}" aria-pressed="true"`));
    assert.ok(html.includes(`aria-pressed="true" class="size on">${size}</button>`));
    assert.equal(html.match(/<img[^>]* src="([^"]+)"/)[1], image);
    assert.doesNotMatch(html, />בחרו מידה<\/button>/);
  }
});

test("quick sheet keeps unavailable sizes unselected and falls back when color photos are missing", () => {
  const invalid = renderQuick(picturedCatalog[0], 0, "L");
  assert.doesNotMatch(invalid, /class="size on"/);
  assert.match(invalid, />בחרו מידה<\/button>/);
  const noPhoto = { ...picturedCatalog[0], choices: picturedCatalog[0].choices.map((choice) => ({ ...choice, image: undefined })) };
  assert.match(renderQuick(noPhoto, 1, "L"), /<img[^>]* src="\/default.jpg"/);
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
    "@/lib/store": { useScrollLock: () => {}, useStore: () => ({ cart, cartOpen: true, pricing: { byP: {}, regular: 200, total: 200, count: 4, savings: 0 }, cartQuote: { pending: false } }) },
    "./icons": load("components/icons.tsx"),
  };
  const { Overlays } = load("components/Overlays.tsx", dependencies);
  const { CheckoutView } = load("components/CheckoutView.tsx", dependencies);
  const drawer = renderToStaticMarkup(React.createElement(Overlays)).match(/<aside class="drawer cart[\s\S]*?<\/aside>/)[0];
  const checkout = renderToStaticMarkup(React.createElement(CheckoutView)).match(/<aside class="aside-box"[\s\S]*?<\/aside>/)[0];
  for (const html of [drawer, checkout]) {
    assert.deepEqual([...html.matchAll(/<img[^>]* src="([^"]+)"/g)].map((match) => match[1]), ["/navy-m.jpg", "/white-l.jpg", "/white-xxl.jpg"]);
  }
});

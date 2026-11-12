// Manual integration check: creates an anonymous Shopify cart, never places an order.
// Usage: node scripts/verify-checkout-selection.cjs <path-to-playwright-module>
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const ts = require("typescript");
const { chromium } = require(process.argv[2] || "playwright");
require("@next/env").loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  let source = fs.readFileSync(file, "utf8");
  if (file.endsWith("load-catalog.ts")) source += "\nexport { toProduct };";
  new Function("require", "module", "exports", compile(source))((name) => {
    if (name === "server-only") return {};
    if (name === "next/headers") return { headers: async () => new Headers() };
    if (name.startsWith("@/") && name.endsWith(".json")) return JSON.parse(fs.readFileSync(name.slice(2), "utf8"));
    if (name.startsWith("@/")) return load(name.slice(2) + ".ts");
    if (name.startsWith(".") && name.endsWith(".json")) return JSON.parse(fs.readFileSync(path.resolve(path.dirname(file), name), "utf8"));
    if (name.startsWith(".")) return load(path.resolve(path.dirname(file), name + ".ts"));
    return require(name);
  }, module, module.exports);
  return module.exports;
}

async function main() {
  const verifyWebhook = process.env.VERIFY_PAID_WEBHOOK === "1";
  const verifyCompletion = verifyWebhook || process.env.VERIFY_PAYMENT_COMPLETION === "1";
  if (verifyWebhook) {
    // Isolated Redis REST test double; no production payment records are written.
    const records = new Map();
    const originalFetch = global.fetch;
    process.env.SHOPIFY_WEBHOOK_SECRET = require("node:crypto").randomBytes(32).toString("hex");
    process.env.UPSTASH_REDIS_REST_URL = "https://webhook-verification.invalid";
    process.env.UPSTASH_REDIS_REST_TOKEN = "isolated-verification-token";
    global.fetch = async (url, options) => {
      if (url !== process.env.UPSTASH_REDIS_REST_URL) return originalFetch(url, options);
      const [command, key, value] = JSON.parse(options.body);
      let result = records.get(key) ?? null;
      if (command === "SET") { result = records.has(key) ? null : "OK"; if (result) records.set(key, value); }
      return Response.json({ result });
    };
  }
  const verifyReturn = verifyCompletion || process.env.VERIFY_CHECKOUT_RETURN === "1";
  const multiple = verifyReturn || process.env.VERIFY_MULTIPLE_VARIANTS === "1";
  const { fetchProductsPage } = load("lib/shopify/products.ts");
  const { toProduct } = load("lib/shopify/load-catalog.ts");
  const { beginShopifyCheckout, quoteShopifyCart } = load("app/actions/shopify-checkout.ts");
  const { checkShopifyCheckout } = load("app/actions/checkout-status.ts");
  const result = await fetchProductsPage({ first: 50, query: "title:חולצת*" });
  let scenario;
  for (const raw of result.items) {
    const p = toProduct(raw, "pro");
    const available = p.choices.filter((v) => v.available && v.color && v.image);
    for (const before of available) {
      const after = available.find((v) => v.color !== before.color && v.size !== before.size && v.image !== before.image);
      const sameColor = available.find((v) => v.color === before.color && v.size !== before.size);
      const sameSize = available.find((v) => v.color !== before.color && v.size === before.size);
      if (after && (!multiple || (sameColor && sameSize))) { scenario = { p, before, after, sameColor, sameSize }; break; }
    }
    if (scenario) break;
  }
  assert.ok(scenario, "No available color/size/image change found");
  const { p, before, after } = scenario;
  const initial = multiple ? [{ variant: before, qty: 2 }, { variant: scenario.sameColor, qty: 1 }, { variant: scenario.sameSize, qty: 3 }] : [{ variant: before, qty: 2 }];
  const expected = [{ variant: after, qty: verifyReturn ? 3 : 2 }, ...initial.slice(1)];
  assert.equal(new Set(expected.map(({ variant }) => variant.id)).size, expected.length);
  const sources = {};
  for (const [name, file] of Object.entries({ react: "react/cjs/react.production.js", "react/jsx-runtime": "react/cjs/react-jsx-runtime.production.js", "react-dom": "react-dom/cjs/react-dom.production.js", "react-dom/client": "react-dom/cjs/react-dom-client.production.js", scheduler: "scheduler/cjs/scheduler.production.js" })) {
    sources[name] = fs.readFileSync(path.join("node_modules", file), "utf8");
  }
  const components = { "@overlays": "Overlays", "./CheckoutButton": "CheckoutButton", "./CartItem": "CartItem", "./CartContents": "CartContents", "./CartOfferCompletion": "CartOfferCompletion", "./QuantityUnitPicker": "QuantityUnitPicker", "./ProductImage": "ProductImage" };
  for (const [name, file] of Object.entries(components)) sources[name] = compile(fs.readFileSync(`components/${file}.tsx`, "utf8"));
  for (const name of ["image-sources", "catalog", "pricing", "colors", "sizes", "category-filters", "product-selection", "cart-selection", "use-cart-quote", "checkout-return", "use-checkout-return", "cart-groups", "quantity-offers", "quantity-selection", "offer-completion-price"]) sources[`@/lib/${name}`] = compile(fs.readFileSync(`lib/${name}.ts`, "utf8"));
  sources["@/lib/store"] = compile(fs.readFileSync("lib/store.tsx", "utf8"));
  const browser = await chromium.launch({ headless: true, ignoreDefaultArgs: ["--disable-back-forward-cache"], ...(process.env.VERIFY_CHROMIUM_PATH ? { executablePath: process.env.VERIFY_CHROMIUM_PATH } : {}) });
  let fixtureServer;
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(15000);
    page.on("pageerror", (error) => console.error("Browser: " + error.message.replace(/https?:\/\/\S+/g, "[URL]")));
    let sent;
    let quoteRequests = 0;
    let holdCheckout = false;
    let checkoutRequests = 0;
    let simulatedStatus;
    let statusRequests = 0;
    await page.exposeFunction("verifyCheckoutStatus", (receipt) => {
      statusRequests++;
      return simulatedStatus ? { status: simulatedStatus } : checkShopifyCheckout(receipt);
    });
    await page.exposeFunction("verifyRealQuote", (lines) => { quoteRequests++; return quoteShopifyCart(lines); });
    await page.exposeFunction("verifyRealCheckout", async (lines, expectedTotal) => {
      checkoutRequests++;
      // Recreate the pending UI retained in a cached page without navigating again.
      if (holdCheckout) return new Promise(() => {});
      sent = lines;
      assert.equal(lines.length, expected.length);
      for (const { variant, qty } of expected) {
        const line = lines.find((line) => line.variantId === variant.id);
        assert.ok(line, "Checkout payload lost a separate variant");
        assert.equal(line.color, variant.color);
        assert.equal(line.size, variant.size);
        assert.equal(line.qty, qty);
      }
      return beginShopifyCheckout(lines, expectedTotal);
    });
    const bootstrap = ({ sources, product, initial, realStorage }) => {
      const lines = initial.map(({ variant, qty }) => ({ key: `${product.id}|${variant.color}|${variant.size}`, instanceId: variant.id, pid: product.id, color: variant.color, size: variant.size, qty, variantId: variant.id, unitPrice: variant.price }));
      if (realStorage) {
        if (!localStorage.getItem("ahim-cart")) localStorage.setItem("ahim-cart", JSON.stringify(lines));
        window.addEventListener("pageshow", (event) => { window.verifyRestored = event.persisted; });
      } else {
        const storage = new Map([["ahim-cart", JSON.stringify(lines)]]);
        Object.defineProperty(window, "localStorage", { value: { getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) } });
      }
      const cache = {};
      const aliases = Object.fromEntries(["colors", "sizes", "catalog", "catalog-context", "category-filters", "product-selection", "cart-selection", "use-cart-quote", "checkout-return", "use-checkout-return", "cart-groups", "quantity-offers", "quantity-selection", "offer-completion-price", "pricing"].map((name) => ["./" + name, "@/lib/" + name]));
      function require(name) {
        name = aliases[name] || name;
        if (cache[name]) return cache[name].exports;
        if (!sources[name]) throw Error("Missing browser module: " + name);
        const module = { exports: {} };
        cache[name] = module;
        new Function("require", "module", "exports", sources[name])(require, module, module.exports);
        return module.exports;
      }
      const React = require("react");
      const stub = (name, value) => { cache[name] = { exports: value }; };
      stub("next/link", ({ children, ...props }) => React.createElement("a", props, children));
      stub("next/navigation", { usePathname: () => "/c/pro" });
      const catalog = { product: () => product, products: [product], categories: [], category: () => ({ name: "ביגוד מקצועי" }) };
      stub("@/lib/catalog-context", { useCatalog: () => catalog });
      stub("./icons", { IconCheck: () => null, IconSearch: () => null });
      stub("@/app/actions/shopify-checkout", { beginShopifyCheckout: (lines, total) => window.verifyRealCheckout(lines, total), quoteShopifyCart: (lines) => window.verifyRealQuote(lines) });
      stub("@/app/actions/checkout-status", { checkShopifyCheckout: (receipt) => window.verifyCheckoutStatus(receipt) });
      const { StoreProvider, useStore } = require("@/lib/store");
      function Inspector() { window.verifyStore = useStore(); return null; }
      require("react-dom/client").createRoot(document.getElementById("root")).render(React.createElement(StoreProvider, null, React.createElement(require("@overlays").Overlays), React.createElement(Inspector)));
    };
    let fixtureUrl;
    if (verifyReturn) {
      const data = JSON.stringify({ sources, product: p, initial, realStorage: true }).replace(/</g, "\\u003c");
      const html = '<html dir="rtl"><head><meta charset="utf-8"><style>' + fs.readFileSync("app/globals.css", "utf8") + '</style></head><body><div id="root"></div><script>(' + bootstrap.toString() + ')(' + data + ')</script></body></html>';
      fixtureServer = require("node:http").createServer((req, res) => {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
      });
      await new Promise((resolve) => fixtureServer.listen(0, "127.0.0.1", resolve));
      fixtureUrl = `http://127.0.0.1:${fixtureServer.address().port}/`;
      await page.goto(fixtureUrl);
    } else {
      await page.setContent('<html dir="rtl"><head><style>' + fs.readFileSync("app/globals.css", "utf8") + '</style></head><body><div id="root"></div></body></html>');
      await page.evaluate(bootstrap, { sources, product: p, initial });
    }
    await page.waitForFunction((count) => window.verifyStore?.cart.length === count, initial.length);
    await page.evaluate(() => window.verifyStore.openCart());
    const row = page.locator(".drawer.cart .line").first();
    await row.getByRole("button", { name: "שינוי צבע ומידה", exact: true }).click();
    await row.getByLabel("צבע", { exact: true }).selectOption(after.color);
    const { sizeLabel } = load("lib/sizes.ts");
    await row.getByLabel("מידה", { exact: true }).selectOption(sizeLabel(after.size));
    await row.getByRole("button", { name: "שמירה", exact: true }).click();
    await page.waitForFunction((id) => window.verifyStore.cart[0].variantId === id, after.id);
    if (verifyReturn) {
      await row.getByRole("button", { name: "הוספה", exact: true }).click();
      await page.waitForFunction(() => window.verifyStore.cart[0].qty === 3);
    }
    assert.equal(await page.evaluate(() => window.verifyStore.cart[0].unitPrice), after.price);
    await page.waitForFunction(() => !!window.verifyStore.cartQuote.quote, { timeout: 30000 });
    const verifiedQuote = await page.evaluate(() => window.verifyStore.cartQuote.quote);
    await page.locator(".drawer.cart").getByRole("button", { name: "מעבר לתשלום", exact: true }).click();
    await page.waitForURL((url) => url.protocol === "https:", { timeout: 30000, waitUntil: "domcontentloaded" });
    assert.ok(sent, "Checkout action was not called");
    await page.getByText(p.name, { exact: true }).first().waitFor({ timeout: 30000 });
    if (multiple) {
      const productRows = page.getByRole("row").filter({ hasText: p.name });
      assert.equal(await productRows.count(), expected.length, "Different variants were merged in checkout");
      const normalize = (text) => text.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "").trim();
      const asset = (url) => decodeURIComponent(new URL(url).pathname.split("/").pop()).replace(/_\d+x\d*(?=\.[^.]+$)/, "");
      const checked = [];
      const seen = new Set();
      for (const { variant, qty } of expected) {
        let matched;
        for (let i = 0; i < await productRows.count(); i++) {
          const item = productRows.nth(i);
          const text = normalize(await item.innerText());
          if (!seen.has(i) && text.includes(variant.color + " / " + variant.size) && text.includes("מידה: " + variant.size)) { matched = { item, index: i }; break; }
        }
        assert.ok(matched, "Missing checkout color/size: " + variant.color + " / " + variant.size);
        seen.add(matched.index);
        const cells = (await matched.item.getByRole("cell").allTextContents()).map(normalize);
        assert.equal(cells[cells.length - 2], String(qty), "Wrong quantity for variant");
        const quoted = verifiedQuote.lines[variant.id];
        assert.equal(quoted.quantity, qty);
        assert.ok(cells[cells.length - 1].includes(quoted.total.toFixed(2)), "Wrong line price for variant");
        const photo = matched.item.locator("img").first();
        await photo.waitFor();
        await photo.evaluate((img) => img.complete ? Promise.resolve() : new Promise((resolve) => img.addEventListener("load", resolve, { once: true })));
        const image = await photo.evaluate((img) => ({ src: img.currentSrc || img.src, loaded: img.complete && img.naturalWidth > 0 }));
        assert.ok(image.loaded && asset(image.src) === asset(variant.image), "Wrong image for variant");
        checked.push({ color: variant.color, size: variant.size, quantity: qty, unitPrice: variant.price, lineTotal: quoted.total, imageMatched: true });
      }
      const directory = path.resolve("uploads/verification");
      fs.mkdirSync(directory, { recursive: true });
      const report = { passed: true, product: p.name, lines: checked, total: checked.reduce((sum, line) => sum + line.lineTotal, 0), host: new URL(page.url()).hostname };
      const totals = await page.getByRole("row").filter({ hasText: "סה״כ" }).allTextContents();
      assert.ok(totals.some((row) => row.includes(report.total.toFixed(2))), "Wrong checkout total");
      if (verifyReturn) {
        const requestsBeforeReturn = quoteRequests;
        await page.goBack({ waitUntil: "domcontentloaded" });
        await page.waitForURL(fixtureUrl);
        const restoredFromCache = await page.evaluate(() => !!window.verifyRestored);
        async function assertRestored(label, previousRequests) {
          await page.waitForFunction(() => window.verifyStore?.cart.length === 3 && !!window.verifyStore.cartQuote.quote);
          assert.ok(quoteRequests > previousRequests, label + ": Shopify price was not refreshed");
          const state = await page.evaluate(() => ({ cart: window.verifyStore.cart, quote: window.verifyStore.cartQuote.quote, stored: JSON.parse(localStorage.getItem("ahim-cart")) }));
          assert.deepEqual(state.cart, state.stored, label + ": storage differs from cart");
          assert.deepEqual(state.quote, verifiedQuote, label + ": wrong refreshed prices");
          for (const { variant, qty } of expected) {
            const line = state.cart.find((line) => line.variantId === variant.id);
            assert.ok(line, label + ": missing variant");
            assert.deepEqual([line.color, line.size, line.qty, line.unitPrice], [variant.color, variant.size, qty, variant.price]);
          }
          await page.evaluate(() => window.verifyStore.openCart());
          const drawer = page.locator(".drawer.cart");
          await drawer.getByRole("button", { name: "מעבר לתשלום", exact: true }).waitFor();
          assert.ok(await drawer.getByRole("button", { name: "מעבר לתשלום", exact: true }).isEnabled(), label + ": checkout still pending");
          const items = drawer.locator(".line");
          assert.equal(await items.count(), expected.length);
          for (let i = 0; i < expected.length; i++) {
            const item = items.nth(i);
            assert.ok(await item.getByRole("button", { name: "שינוי צבע ומידה", exact: true }).isEnabled(), label + ": editing still locked");
            const src = await item.locator("img").getAttribute("src");
            assert.equal(asset(src), asset(expected[i].variant.image), label + ": wrong color image");
            const { fmt } = load("lib/pricing.ts");
            assert.ok((await item.locator(".cart-item-heading strong").innerText()).includes(fmt(state.quote.lines[expected[i].variant.id].total)), label + ": wrong displayed price");
          }
        }
        await assertRestored("Back from Shopify", requestsBeforeReturn);
        const requestsBeforeReload = quoteRequests;
        await page.reload({ waitUntil: "domcontentloaded" });
        await assertRestored("Reload after return", requestsBeforeReload);
        holdCheckout = true;
        const checkoutButton = page.locator(".drawer.cart").getByRole("button", { name: "מעבר לתשלום", exact: true });
        await checkoutButton.click();
        await page.getByRole("button", { name: "פותחים תשלום מאובטח…", exact: true }).waitFor();
        assert.ok(await page.locator(".drawer.cart .line").first().getByRole("button", { name: "שינוי צבע ומידה", exact: true }).isDisabled());
        const requestsBeforeRestoreEvent = quoteRequests;
        await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
        await page.waitForFunction(() => window.verifyStore.cartQuote.pending);
        await assertRestored("Cached-page restore event", requestsBeforeRestoreEvent);
        const checkoutRequestsBeforeRetry = checkoutRequests;
        await checkoutButton.click();
        await page.waitForFunction(() => document.querySelector('.drawer.cart button[aria-busy="true"]'));
        assert.equal(checkoutRequests, checkoutRequestsBeforeRetry + 1, "Checkout busy ref was not cleared on restoration");
        const requestsBeforeSecondRestore = quoteRequests;
        await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
        await page.waitForFunction(() => window.verifyStore.cartQuote.pending);
        await page.getByRole("button", { name: "מעבר לתשלום", exact: true }).waitFor();
        await assertRestored("Second cached-page restore event", requestsBeforeSecondRestore);
        const returnReport = { ...report, browserBack: true, restoredFromCache, reload: true, simulatedCachedPageRestore: true, realLocalStorage: true, repricedFromShopify: true, editingUnlocked: true };
        fs.writeFileSync(path.join(directory, "shopify-cart-return.json"), JSON.stringify(returnReport, null, 2));
        await page.screenshot({ path: path.join(directory, "shopify-cart-return.png"), fullPage: true });
        if (verifyCompletion) {
          assert.ok(statusRequests > 0, "Return did not check payment status");
          assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("ahim-pending-checkouts")).length), 1, "Checkout receipt was not persisted");
          const unpaidSnapshot = await page.evaluate(() => ({ cart: localStorage.getItem("ahim-cart"), pending: localStorage.getItem("ahim-pending-checkouts") }));
          if (!verifyWebhook) simulatedStatus = "pending";
          await page.reload({ waitUntil: "domcontentloaded" });
          await page.waitForFunction(() => window.verifyStore?.cart.length === 3 && !!window.verifyStore.cartQuote.quote);
          assert.equal(await page.evaluate(() => window.verifyStore.cart.reduce((n, line) => n + line.qty, 0)), 7, "Unpaid return lost items");
          // No purchase is placed: deliver a synthetic signed paid notification.
          if (verifyWebhook) {
            const { POST } = load("app/api/shopify/webhooks/orders-paid/route.ts");
            const { shopDomain } = load("lib/shopify/config.ts");
            const receipt = JSON.parse(unpaidSnapshot.pending)[0].receipt;
            const { cartToken } = JSON.parse(Buffer.from(receipt.split(".")[0], "base64url").toString());
            const body = JSON.stringify({ id: 999, cart_token: cartToken, financial_status: "paid", cancelled_at: null });
            const signature = require("node:crypto").createHmac("sha256", process.env.SHOPIFY_WEBHOOK_SECRET).update(body).digest("base64");
            const response = await POST(new Request("https://test.invalid/api/shopify/webhooks/orders-paid", {
              method: "POST", body, headers: { "x-shopify-hmac-sha256": signature, "x-shopify-topic": "orders/paid", "x-shopify-shop-domain": shopDomain() },
            }));
            assert.equal(response.status, 200, "Signed paid webhook was not accepted");
          } else simulatedStatus = "completed";
          await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
          await page.waitForFunction(() => window.verifyStore.cart.length === 0 && localStorage.getItem("ahim-cart") === "[]");
          assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("ahim-pending-checkouts")).length), 0);
          await page.reload({ waitUntil: "domcontentloaded" });
          await page.waitForFunction(() => !!window.verifyStore);
          assert.equal(await page.evaluate(() => window.verifyStore.cart.length), 0, "Reload resurrected purchased items");
          await page.evaluate(({ cart, pending }) => {
            localStorage.setItem("ahim-cart", cart);
            localStorage.setItem("ahim-pending-checkouts", pending);
          }, unpaidSnapshot);
          await page.reload({ waitUntil: "domcontentloaded" });
          await page.waitForFunction(() => window.verifyStore?.cart.length === 0 && localStorage.getItem("ahim-cart") === "[]" && localStorage.getItem("ahim-pending-checkouts") === "[]");
          await page.evaluate(() => window.verifyStore.openCart());
          await page.getByText("הסל ריק", { exact: true }).waitFor();
          const completionReport = { passed: true, realUnpaidShopifyReturn: true, syntheticSignedWebhook: verifyWebhook, redisTestDouble: verifyWebhook, confirmedPaymentClearedCart: true, freshLoadPaidReturnClearedCart: true, reloadStayedEmpty: true, actualOrderPlaced: false };
          const artifact = verifyWebhook ? "shopify-paid-webhook" : "shopify-payment-completion";
          fs.writeFileSync(path.join(directory, artifact + ".json"), JSON.stringify(completionReport, null, 2));
          await page.screenshot({ path: path.join(directory, artifact + ".png"), fullPage: true });
          console.log(JSON.stringify(completionReport));
        }
        console.log(JSON.stringify(returnReport));
        return;
      }
      fs.writeFileSync(path.join(directory, "shopify-multiple-variants.json"), JSON.stringify(report, null, 2));
      await page.screenshot({ path: path.join(directory, "shopify-multiple-variants.png"), fullPage: true });
      await page.screenshot({ path: path.join(directory, "shopify-multiple-variants-summary.png"), clip: { x: 200, y: 90, width: 450, height: 540 } });
      console.log(JSON.stringify(report));
      return;
    }
    const body = await page.locator("body").innerText();
    const rows = await page.getByRole("row").allTextContents();
    const selectedRow = rows.find((row) => row.includes(p.name));
    assert.ok(selectedRow?.includes(after.color), "Checkout shows the wrong color");
    assert.ok(selectedRow.includes(after.size), "Checkout shows the wrong size");
    assert.ok(selectedRow.includes((after.price * 2).toFixed(2)), "Checkout shows the wrong line price");
    const assetKey = (src) => decodeURIComponent(new URL(src).pathname.split("/").pop()).replace(/_\d+x\d*(?=\.[^.]+$)/, "");
    const expectedImage = assetKey(after.image);
    await page.waitForFunction((filename) => [...document.images].some((img) => {
      const asset = decodeURIComponent(new URL(img.currentSrc || img.src).pathname.split("/").pop()).replace(/_\d+x\d*(?=\.[^.]+$)/, "");
      return asset === filename && img.complete && img.naturalWidth > 0;
    }), expectedImage);
    const images = await page.locator("img").evaluateAll((els) => els.map((el) => ({ src: el.currentSrc || el.src, alt: el.alt, loaded: el.complete && el.naturalWidth > 0 })));
    assert.ok(images.some((img) => img.loaded && assetKey(img.src) === expectedImage), "Checkout shows the wrong product image");
    console.log(JSON.stringify({ passed: true, product: p.name, before: { color: before.color, size: before.size, price: before.price }, after: { color: after.color, size: after.size, price: after.price }, quantity: 2, checkoutLineTotal: after.price * 2, host: new URL(page.url()).hostname, imageMatched: true, selectedRow }));
    const directory = path.resolve("uploads/verification");
    fs.mkdirSync(directory, { recursive: true });
    await page.screenshot({ path: path.join(directory, "shopify-edited-selection.png"), fullPage: true });
    await page.screenshot({ path: path.join(directory, "shopify-edited-selection-summary.png"), clip: { x: 200, y: 90, width: 450, height: 350 } });
  } finally {
    await browser.close();
    if (fixtureServer) await new Promise((resolve) => fixtureServer.close(resolve));
  }
}
main().catch((error) => { console.error(String(error.stack || error.message).replace(/https?:\/\/\S+/g, "[URL]")); process.exitCode = 1; });

# Shopify paid-order webhook and cart return

The storefront keeps the cart when checkout opens. Only an authenticated
`orders/paid` webhook can record payment and allow the purchased items to be
removed on return. No Admin API token or read_orders query is used.

## Production setup

1. Connect an Upstash Redis database to the Vercel project through the Storage /
   Marketplace screen. This stores payment markers across functions, deployments
   and server restarts. Configure these server environment variables:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN` (read/write, not the read-only token)
   Existing `KV_REST_API_URL` / `KV_REST_API_TOKEN` pairs are also supported.
2. In Shopify admin, go to Settings > Notifications > Webhooks > Create webhook.
   Select **Order payment**, **JSON**, and API version **2026-10**.
3. Set the URL to `https://YOUR-STOREFRONT/api/shopify/webhooks/orders-paid`.
   For the existing Vercel hostname this is:
   `https://ahimcohen.vercel.app/api/shopify/webhooks/orders-paid`.
   This becomes usable only after deploying this code. The endpoint must be
   reachable by Shopify over HTTPS without deployment login protection.
4. Copy the signing secret for this manual webhook from Shopify's Webhooks
   settings into `SHOPIFY_WEBHOOK_SECRET` in the Vercel server environment.
   For app-managed subscriptions use that app's client secret instead. The
   Storefront token is NOT the webhook signing secret.
5. Deploy with the variables above. Keep the existing private Storefront token
   stable: it signs checkout receipts. An optional dedicated
   `SHOPIFY_CHECKOUT_STATUS_SECRET` takes precedence; changing the signing key
   invalidates old receipts and safely preserves their baskets.
6. Use Shopify's test webhook to verify delivery. A sample event is not a real
   purchase and will not match a customer's cart. Verify a matching checkout
   using an authorized test-payment flow before relying on production clearing.

No custom domain is required: the Vercel hostname works. Customers must return to
that same storefront origin/browser to use the cart stored there. When publishing
or moving domains, set Shopify's continue-shopping destination appropriately.

## Behavior and failure handling

- The endpoint verifies HMAC-SHA256 over the original request bytes before JSON
  parsing, then checks the shop, orders/paid topic, paid financial status and cart.
- Pending/authorized/partially paid/cancelled notifications cannot clear a cart.
  With manual payment capture, clearing waits for the payment to be captured.
- Redis stores only a hashed shop/cart identifier and a `paid` marker for 35 days.
  No customer names, addresses, order payloads or payment details are persisted.
- SET NX makes duplicate notifications idempotent. Success is acknowledged only
  after durable storage; failure returns HTTP 503 so Shopify can retry delivery.
- Missing configuration, invalid signatures, expired/missing carts, URL success
  flags and status-check failures never empty the basket.
- A server-signed checkout receipt expires after 30 days. On load, browser Back,
  focus and visibility restoration, the browser checks the persisted paid marker.
  Bounded retries for roughly four minutes handle late notifications. After that,
  another visit/focus/reload checks again. New items and additional quantities
  added after checkout remain. Replaying a receipt does not remove items twice.
- Webhooks are not guaranteed delivery: monitor failed deliveries in Shopify.
  If the notification is never received, the safe outcome is to keep the cart.

## Verification

Run the checkout-return, paid-webhook, checkout-action and cart tests with Node's
built-in test runner. They cover signature tampering, duplicate deliveries,
multiple server instances, unrelated carts, unpaid events, storage outages and
preservation of new quantities.

For browser integration, run `scripts/verify-checkout-selection.cjs` with
`VERIFY_PAID_WEBHOOK=1`, a Playwright module path and `VERIFY_CHROMIUM_PATH` if
needed. It opens a real Shopify checkout without purchasing, verifies the cart
survives return/reload, then sends a **synthetic signed notification** through the
actual route handler and checks that the UI and localStorage clear. Redis uses an
isolated REST test double. This does not place an order, provision a production
database, configure Shopify notifications or validate live webhook credentials.

References:
- https://help.shopify.com/en/manual/fulfillment/setup/notifications/webhooks
- https://shopify.dev/docs/apps/build/webhooks/verify-deliveries
- https://upstash.com/docs/redis/features/restapi

# Stripe → Paddle Migration Plan

## Context

The project needs a payment processor that works for an individual seller based in Moldova without a registered company. Stripe does not support Moldova as a seller country. Paddle explicitly supports Moldova, allows individual sign-up (identity verification only, no incorporation), and is a merchant of record (handling VAT/tax). The migration replaces all Stripe touchpoints — backend API, frontend UI, env config — with Paddle Billing equivalents, and adds a webhook handler (required by Paddle; currently absent).

---

## Architecture Differences to Internalize

| Concept | Stripe (current) | Paddle (new) |
|---|---|---|
| Payment collection | Stripe Elements + setup intent | Paddle inline checkout (JS overlay) |
| Client credential | publishable key | client-side token (from environment) |
| Server credential | secret key | API key |
| Subscription trial | `trial_period_days` on subscription | `trial_period` on price or transaction |
| Async lifecycle | Not used (sync only) | Required — webhook events |
| Card metadata | Stored locally after `confirmSetup` | Delivered via `transaction.completed` webhook |

The biggest structural change: the current flow is fully synchronous (backend creates subscription → returns `clientSecret` → frontend confirms → done). Paddle is async: frontend opens Paddle checkout → `onComplete` callback fires → webhook delivers authoritative confirmation. The account record is created synchronously at registration; subscription confirmation comes via webhook.

---

## Repository Relationship

The two repos work in tandem:

1. TypeScript source lives in `rss-email-subscription/src/web-ui/*.ts`
2. It compiles to `feedsubscription.com/src/web-ui-scripts/` (via `WEB_UI_DEST_DIR` in Makefile)
3. Eleventy builds `feedsubscription.com/dist/`
4. `make build-website` rsyncs that dist into `rss-email-subscription/website/html/`

Consequence: **never edit JS files in `feedsubscription.com/src/web-ui-scripts/` directly** — they are compiled output.

---

## Files to Change

### rss-email-subscription

**Remove:**
- `src/api/stripe-integration.ts`
- `src/web-ui/stripe-integration.ts`
- `src/domain/stripe-integration.ts`

**Create:**
- `src/api/payment-integration.ts` — backend Paddle functions
- `src/web-ui/payment-integration.ts` — frontend Paddle functions
- `src/domain/payment.ts` — shared `Card`, `makeCardDescription`, `StoreCardRequest`, `PaddleKeysResponseData`

**Modify:**
- `src/domain/api-path.ts` — rename stripe paths, add webhook path
- `src/domain/account.ts` — rename `clientSecret` → `paymentToken` in `PlanChangeResponseData`
- `src/api/registration.ts` — swap Stripe calls for Paddle
- `src/api/account.ts` — swap Stripe calls for Paddle
- `src/api/server.ts` — add webhook route, update route names
- `src/web-ui/registration.ts` — swap payment flow
- `src/web-ui/account.ts` — swap payment flow
- `api-test.spec.ts` — update Stripe-specific imports and assertions
- `package.json` — swap npm dependencies
- `.env.sample` — swap env var names
- `docker-compose.yml` — swap env var names
- `Makefile` — update `extend-trial` target (currently uses Stripe API directly)

### feedsubscription.com

**Modify:**
- `src/includes/csp.njk` — replace `https://js.stripe.com` with Paddle CDN domains (`https://cdn.paddle.com`)
- `Makefile` — update `plan-data`, `app-data`, `setup-service-data` targets (currently fetch from Stripe/`/api/stripe-data`)

**Delete:**
- `src/_data/payment_links_data.json` — intermediate Stripe API artifact, not consumed by templates
- `src/_data/setup_service_data.json` — same: raw Stripe product object, not consumed by templates

**Keep unchanged:**
- `src/_data/setup_service.json` — static (name, description, price); no Stripe dependency
- `src/_data/payment_link.json` — output file consumed by `pricing.njk` as `{{ payment_link.url }}`; update its content when `setup-service-data` make target is rewritten to fetch the Paddle payment link URL

---

## Step-by-Step Implementation

### Step 1: Dependencies

```
npm remove stripe @stripe/stripe-js
npm install @paddle/paddle-node-sdk
```

`@paddle/paddle-js` is loaded from CDN in the browser (same pattern as current Stripe.js dynamic load).

### Step 2: Domain layer (`src/domain/payment.ts`)

Move `Card`, `makeCardDescription`, `StoreCardRequest`, `StoreCardRequestData` here (unchanged).

Replace `StripeKeysResponseData` with:

```ts
export interface PaddleKeysResponseData {
  clientToken: string; // Paddle client-side token
}

export interface PaddleDataResponseData {
  trialPeriodDays: number;
}
```

Update `PlanChangeResponseData` in `src/domain/account.ts`:
```ts
paymentToken: string; // was clientSecret
```

### Step 3: API paths (`src/domain/api-path.ts`)

Rename:
- `stripeKeys` → `paymentKeys`
- `stripeData` → `paymentData`
- `storeStripeCardDescription` → `storeCardDescription`
- `accountSupportProduct` → `accountSupportProduct` (keep as-is, Paddle has equivalent)

Add:
- `paymentWebhook = '/webhook/payment'`

### Step 4: Backend — `src/api/payment-integration.ts`

Implement these functions mirroring the current Stripe file. Internal handler/function names keep the `paddle` prefix where they wrap Paddle-specific calls; only the file name and exported API path identifiers are provider-neutral.

**Config/keys:**
- `paddleKeys(req, res)` — returns `PADDLE_CLIENT_TOKEN` env var
- `paddleData(req, res)` — returns `{ trialPeriodDays: 30 }`

**Card storage (unchanged logic):**
- `storeCardDescription(req, res)` — identical to current `storeStripeCardDescription`
- `loadCardDescription(accountId)` — identical to current

**Customer management:**
- `getOrCreatePaddleCustomer(email)` — list customers by email, create if not found
  - Paddle API: `GET /customers?search={email}`, `POST /customers`

**Subscription management:**
- `createCustomerWithSubscription(email, planId)` — creates customer + transaction with trial
  - Paddle API: `POST /transactions` with items (price ID for plan), `customer_id`, `collection_mode: 'automatic'`, trial via price `trial_period`
  - Returns `{ transactionId: string }` (replaces `clientSecret`)
- `changeCustomerSubscription(email, planId)` — updates existing subscription items
  - Paddle API: find active subscription → `PATCH /subscriptions/{id}` with new `items`
  - If payment method change needed, returns new transaction ID for checkout
- `cancelCustomerSubscription(email)` — cancels active subscription
  - Paddle API: `POST /subscriptions/{id}/cancel` with `effective_from: 'next_billing_period'`
- `getPaddlePriceIdForPlan(planId)` — looks up by `custom_data.res_plan_id` metadata on Paddle prices
  - Paddle API: `GET /prices` → filter by custom_data

**Webhook handler:**
- `paddleWebhookHandler(app)` — returns an Express handler that verifies Paddle signature, dispatches on event type
  - `transaction.completed` → extract card info from `payments[0].method_details`, call `storeCardDescription`
  - `subscription.canceled` → update local account plan to Free (defensive sync)
  - Signature verification: `paddle.webhooks.unmarshal(rawBody, secret, signature)`

**One-time support product (preserve existing feature):**
- `accountSupportProduct(req, res)` — fetch Paddle product with `custom_data.res_code = 'account_setup'` and its payment link

### Step 5: Update `src/api/registration.ts`

Replace:
```ts
const { clientSecret } = await createCustomerWithSubscription(email, planId);
return res.json({ clientSecret });
```
With:
```ts
const { transactionId } = await createCustomerWithSubscription(email, planId);
return res.json({ paymentToken: transactionId });
```

### Step 6: Update `src/api/account.ts`

- `loadCurrentAccount`: replace `loadCardDescription` source (same file, new import path)
- `requestAccountPlanChange`: same three-branch logic, swap Stripe functions for Paddle equivalents
- `deleteAccountWithPassword`: swap `cancelCustomerSubscription` import

### Step 7: Update `src/api/server.ts`

- Replace stripe route imports with paddle imports
- Rename routes to match updated `ApiPath` constants
- Add: `app.post(ApiPath.paymentWebhook, express.raw({ type: '*/*' }), paddleWebhookHandler(app))`
  - Note: webhook route needs raw body (not JSON-parsed) for signature verification

### Step 8: Frontend — `src/web-ui/payment-integration.ts`

Replace Stripe Elements flow with Paddle inline checkout:

```ts
// Initialize Paddle (replaces getStripe)
async function getPaddle(): Promise<Paddle> {
  // Load @paddle/paddle-js from CDN dynamically
  // Initialize with client token from /api/payment-keys
}

// Open inline checkout (replaces buildPaymentElement)
function openPaddleCheckout(transactionId: string, container: HTMLElement, onComplete: () => void)

// Validate (simpler — Paddle handles validation internally)
async function maybeValidatePaymentSubform(): Promise<boolean>

// Confirm (replaces maybeConfirmPayment — Paddle checkout IS the confirmation)
async function maybeOpenPaddleCheckout(transactionId: string, container: HTMLElement): Promise<void>
```

Key difference: there is no separate "validate then confirm" step. Paddle's checkout UI handles everything. The `onComplete` callback fires when Paddle reports success; the authoritative state comes via webhook.

Preserve: `loadPlanPrices`, `getPlanOptionLabel`, `formatPlanTitleAndPrice`, `buildPlanDropdownOptions` — these are Stripe-agnostic and can be moved/reused as-is.

### Step 9: Update `src/web-ui/registration.ts` and `account.ts`

Swap Stripe import calls for Paddle equivalents. The overall shape (validate → submit → open checkout → on complete) stays the same; the implementation of the payment step changes.

`registration.ts`: after backend responds with `paymentToken`, open Paddle checkout instead of calling `stripe.confirmSetup()`.

`account.ts`: same pattern for plan changes.

### Step 10: Env and config

`.env.sample`:
```
PADDLE_CLIENT_TOKEN=test_...
PADDLE_API_KEY=...
PADDLE_WEBHOOK_SECRET=...
```

`docker-compose.yml`: replace `STRIPE_*` with `PADDLE_*`.

### Step 11: Tests (`api-test.spec.ts`)

- Replace `getStripeCardDescriptionStorageKey` import with equivalent from new domain file
- Update plan-change response field `clientSecret` → `paymentToken`
- Update any Stripe SDK direct calls

---

### Step 12: feedsubscription.com — CSP

`src/includes/csp.njk`: replace `https://js.stripe.com` with `https://cdn.paddle.com` in both `script-src` and `frame-src` directives.

### Step 13: feedsubscription.com — Makefile `data` targets

The `data` make target (and its sub-targets) currently calls the Stripe API directly to build `plans.json`, `setup-service.json`, and `payment-link.json`. Each fetches from `api.stripe.com` using `$STRIPE_SECRET_KEY`.

Replace with Paddle equivalents:
- `plan-data`: fetch prices from `api.paddle.com/prices` filtered by `custom_data.res_plan_id`, combine with `plan_settings.json`
- `app-data`: update URL from `/api/stripe-data` → `/api/payment-data`
- `setup-service-data`: fetch product/price from Paddle by `custom_data.res_code = 'account_setup'`; fetch payment link by `custom_data.res_code = 'account_setup_payment_link'`
- Remove `$STRIPE_SECRET_KEY` env var references; use `$PADDLE_API_KEY`

### Step 14: feedsubscription.com — payment_links_data.json

Delete `src/_data/payment_links_data.json` and `src/_data/setup_service_data.json` (Stripe API artifacts). The `setup-service-data` make target should write the Paddle payment link URL directly to `src/_data/payment_link.json` (the only file `pricing.njk` actually consumes).

### Step 15: rss-email-subscription Makefile — extend-trial

The `extend-trial` target calls the Stripe API directly to extend a subscription trial. Replace with equivalent Paddle API call:

```bash
# Paddle: update subscription trial_ends_at
curl -X PATCH https://api.paddle.com/subscriptions/$SUB_ID \
  -H "Authorization: Bearer $PADDLE_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"trial_ends_at\": \"${TRIAL_END}T00:00:00Z\"}"
```

---

## Paddle Dashboard Setup (required before testing)

Do this in sandbox first, then repeat for production.

1. **Create subscription prices** (Catalog → Products):

   | Plan | Price | `custom_data` | Trial |
   |---|---|---|---|
   | Courage | $5/month | `{"res_plan_id": "courage"}` | 30 days |
   | Strength | $10/month | `{"res_plan_id": "strength"}` | 30 days |
   | Mastery | $20/month | `{"res_plan_id": "mastery"}` | 30 days |

2. **Create support product** with `custom_data: {"res_code": "account_setup"}` and a payment link with `custom_data: {"res_code": "account_setup_payment_link"}`.

3. **Set default checkout URL** (Checkout settings): `https://feedsubscription.com`

4. **Configure webhook endpoint**: `https://feedsubscription.com/api/webhook/payment`
   - Events: `transaction.completed`, `subscription.activated`, `subscription.canceled`

5. **Copy credentials to env**: Client Token, API Key, Webhook Secret

---

## API Key Management

### Required scopes

When minting `PADDLE_API_KEY`, grant only the scopes the runtime actually needs:

| Resource | Read | Write | Used for |
|---|---|---|---|
| Customers | yes | yes | `customers.list` (find by email), `customers.create` |
| Subscriptions | yes | yes | `subscriptions.list`, `subscriptions.update` (plan change), `subscriptions.cancel` |
| Transactions | — | yes | `transactions.create` (new sub + payment-method-refresh on plan change) |
| Prices | yes | — | `prices.list` (lookup by `custom_data.res_plan_id`) |
| Products | yes | — | `products.list` (lookup support product by `custom_data.res_code`) |

Notes:

- `paddle.webhooks.unmarshal` is a local signature check using `PADDLE_WEBHOOK_SECRET` — no API permission needed.
- The Makefile `extend-trial` target hits `PATCH /subscriptions/{id}` — covered by Subscriptions write.
- The `feedsubscription.com` build-time Makefile (Step 13) reads prices/products at build time — covered by the read scopes above. A separate read-only key is reasonable for least-privilege there.

### Expiration and rotation

Set the key to expire in **1 year** (or 180 days for stricter posture). Avoid "no expiry" — it removes the forcing function to ever rotate. Add a calendar reminder ~2 weeks before expiry so rotation is planned, not an outage.

Paddle allows multiple active API keys, so use add-new → cut-over → revoke-old:

1. **Mint new key** in the Paddle dashboard with the same scopes. Don't touch the old key yet.
2. **Update `.env` on prod**:
   ```bash
   ssh -S ~/.ssh/control-feedsubscription feedsubscription.com \
     'sed -i "s/^PADDLE_API_KEY=.*/PADDLE_API_KEY=NEW_VALUE/" ~/path/to/.env'
   ```
3. **Recreate Paddle-touching containers**:
   ```bash
   docker compose --project-name res up -d --force-recreate api app
   ```
4. **Verify**: trigger a plan-change for a test account and tail logs for `Failed to paddle.*` errors.
5. **Revoke the old key** in the Paddle dashboard.

### Independent secrets

- `PADDLE_WEBHOOK_SECRET` rotates separately — it's tied to the webhook endpoint config in the dashboard, not the API key. Same add-new → cut-over pattern.
- `PADDLE_CLIENT_TOKEN` is a public client-side token; rotate only if compromised.

---

## Verification

1. `make test` — unit/integration tests pass
2. Registration flow (sandbox): register with Courage plan → Paddle checkout opens → complete with test card → webhook fires → account shows card description
3. Plan change: upgrade Courage → Strength → checkout opens → completes → card updated
4. Plan cancel: downgrade to Free → subscription canceled in Paddle dashboard
5. Account deletion: verify Paddle subscription canceled
6. Check Paddle dashboard: subscriptions and customers appear correctly

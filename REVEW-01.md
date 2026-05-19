# Review 01: PR #2

PR: https://github.com/gurdiga/rss-email-subscription/pull/2

Scope reviewed: Stripe to Paddle migration across backend payment integration, frontend checkout flow, API routes, environment/config changes, and generated website artifacts.

## Findings

1. **P1: production is hardwired to Paddle sandbox**

   `src/api/payment-integration.ts:418` always creates `new Paddle(..., { environment: Environment.sandbox })`. With live credentials this will hit the sandbox API and fail with cross-environment auth, or production will keep using sandbox payments.

   Recommendation: make the Paddle environment configurable and keep the backend `Paddle` API environment aligned with the frontend `PADDLE_CLIENT_TOKEN` environment.

2. **P1: checkout completion is wired to the wrong Paddle.js hook**

   `src/web-ui/payment-integration.ts:51` passes `eventCallback` into `Paddle.Checkout.open()`, and the promise only resolves from that callback at `src/web-ui/payment-integration.ts:59`. Paddle documents checkout events through `Paddle.Initialize()`, while `Paddle.Checkout.open()` is for checkout settings, items, and transaction data.

   If Paddle ignores this field, successful checkouts leave the registration or plan-change submit flow waiting forever.

   Recommendation: cache Paddle initialization and register the checkout event callback through `Paddle.Initialize()`, then resolve the pending checkout operation when `checkout.completed` arrives.

3. **P1: paid-to-paid plan changes can create an extra subscription**

   `src/api/payment-integration.ts:330` updates the existing subscription, then `src/api/payment-integration.ts:338` creates a separate automatically collected transaction with the same recurring price and returns that transaction for checkout.

   Paddle documents that completed automatically collected transactions with recurring items create subscriptions, so this path risks changing the old subscription and then creating a new one when checkout completes.

   Recommendation: use the subscription update flow directly, or the SDK's payment-method-change transaction/customer-auth-token flow, rather than creating a separate recurring transaction after updating the subscription.

4. **P1: CSP still blocks the Paddle checkout script/frame**

   `src/web-ui/payment-integration.ts:92` dynamically loads `https://cdn.paddle.com/paddle/v2/paddle.js`, but deployed pages still allow only Stripe in CSP. For example:

   1. `website/html/user/account.html:10`
   2. `website/html/user/account.html:11`
   3. `website/html/user/registration.html:10`
   4. `website/html/user/registration.html:11`

   The browser will block Paddle.js or its iframe before checkout can render.

   Recommendation: update the website CSP source and generated `website/html` output to allow Paddle and remove Stripe.

5. **P2: external subscription cancellations do not update local accounts**

   `src/api/payment-integration.ts:457` only handles `transaction.completed`. If a subscription is canceled from the Paddle dashboard, dunning, support, or webhook replay, the local account remains on a paid plan.

   Recommendation: handle at least `subscription.canceled` and map the Paddle customer/subscription back to the local account.

6. **P2: `extend-trial` still uses Stripe**

   `Makefile:1334` keeps the `extend-trial` target, but `Makefile:1341` still calls `https://api.stripe.com/v1/subscriptions/$$SUB_ID` with `STRIPE_SECRET_KEY`.

   The PR removes Stripe env vars from `.env.sample`, `docker-compose.yml`, and `initApp()`, so this operational target is now stale.

   Recommendation: rewrite this target for Paddle or remove it until there is a Paddle equivalent.

## Verification

1. `gh pr view https://github.com/gurdiga/rss-email-subscription/pull/2 --json ...`
2. `gh pr diff https://github.com/gurdiga/rss-email-subscription/pull/2`
3. `gh pr checkout 2`
4. `make compile`
5. `make test`

Results:

1. Branch was clean and up to date with `origin/stripe-to-paddle`.
2. `make compile` passed.
3. `make test` passed with `301 passing`.

I did not run `make api-test` because this branch's registration path calls the configured Paddle API and can create real sandbox/live Paddle customers or transactions from `.env`.

## References

1. Paddle sandbox docs: https://developer.paddle.com/build/tools/sandbox
2. `Paddle.Initialize()`: https://developer.paddle.com/paddlejs/methods/paddle-initialize
3. `Paddle.Checkout.open()`: https://developer.paddle.com/paddlejs/methods/paddle-checkout-open
4. `transaction.completed` webhook: https://developer.paddle.com/webhooks/transactions/transaction-completed

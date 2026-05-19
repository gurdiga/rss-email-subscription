# Review 02: PR #2

PR: https://github.com/gurdiga/rss-email-subscription/pull/2

Scope reviewed: second pass on the Stripe to Paddle migration after the fixes for `REVEW-01.md`, focused on Paddle environment wiring, checkout rendering, customer/subscription lookup safety, generated website artifacts, and operational Makefile changes.

## Findings

1. **P1: sandbox Paddle.js checkout is still pointed at the live environment**

   `src/web-ui/payment-integration.ts:101` loads Paddle.js and `src/web-ui/payment-integration.ts:111` calls `Paddle.Initialize({ token: clientToken, ... })`, but nothing calls `Paddle.Environment.set("sandbox")` before initialization. Paddle.js defaults to production unless that method is called. With the `.env.sample` `PADDLE_CLIENT_TOKEN=test_...`, local/sandbox checkout will initialize against the live frontend environment and fail before the PR's sandbox test plan can pass.

   The backend fix in `src/api/payment-integration.ts:407` also keys the SDK environment off `NODE_ENV`, not the Paddle credentials or an explicit Paddle environment setting. That works for a narrow local-dev/live-prod split, but it breaks production-like staging with sandbox credentials and leaves the frontend/backend environment choice split across unrelated signals.

   Recommendation: add an explicit `PADDLE_ENVIRONMENT=sandbox|production` (or return a derived environment from `/payment-keys` based on the token prefix) and use the same value in both `makePaddle()` and `initPaddle()`. The frontend should call `Paddle.Environment.set("sandbox")` before `Paddle.Initialize()` when using sandbox.

2. **P1: inline checkout is targeted by element id, but Paddle expects a class name**

   `src/web-ui/payment-integration.ts:56` opens an inline checkout with `frameTarget: paymentSubform.id || 'payment-subform'`. Paddle's inline checkout setting is documented as the class name of the target `<div>`, not an element id. The generated account page has `<div id="payment-subform" class="form-control">` at `website/html/user/account.html:411`, so there is no `payment-subform` class for Paddle to render into. A paid plan change can create/update the backend transaction, then fail to display checkout on the page.

   Recommendation: give the target element a dedicated class such as `payment-subform`, pass that class name to `frameTarget`, and keep the `id` only for local DOM lookup/labels. When registration is re-enabled, make sure its template uses the same target convention.

3. **P1: customer lookup can act on the wrong Paddle customer**

   `src/api/payment-integration.ts:280` uses `paddle.customers.list({ search: email.value }).next()` and `src/api/payment-integration.ts:287` takes the first result. Paddle's `search` parameter searches `id`, `name`, and `email`; it is not exact email matching. That lookup feeds customer reuse, paid-to-paid plan changes, cancellations, and account deletion, so a fuzzy first result can update or cancel the wrong customer's subscription.

   Recommendation: use `paddle.customers.list({ email: [email.value] })` for exact email matching, verify the returned customer email before using it, and treat multiple active matches as an error that needs manual cleanup.

4. **P1: deployed website artifacts still block and load the Stripe integration**

   The `REVEW-01.md` CSP finding is still present. The generated account page still has `script-src` and `frame-src` limited to `https://js.stripe.com` at `website/html/user/account.html:10` and `website/html/user/account.html:11`, while the new runtime code loads `https://cdn.paddle.com/paddle/v2/paddle.js`. The generated browser bundle is also stale: `website/html/web-ui-scripts/web-ui/account.js` still imports `./stripe-integration` and calls the old Stripe flow.

   Recommendation: before merging/deploying, update the feedsubscription.com source CSP and regenerate `website/html` so the deployed pages allow Paddle, remove Stripe, and serve the new `payment-integration` bundle.

5. **P2: `extend-trial` always calls the live Paddle API**

   `Makefile:1340` calls `https://api.paddle.com/subscriptions/$$SUB_ID` unconditionally. Sandbox Paddle API keys must use `https://sandbox-api.paddle.com`; using a sandbox key against the live base URL returns a forbidden error. This target is now unusable for the same sandbox setup the PR still needs for end-to-end verification.

   Recommendation: make the Paddle API base URL configurable, or derive it from an explicit `PADDLE_ENVIRONMENT` shared with the app.

## Verification

1. `gh pr view https://github.com/gurdiga/rss-email-subscription/pull/2 --json ...`
2. Confirmed local checkout is at PR head `f0663424f70d6046b61bb6a26583b51b9bea973d`.
3. `git diff 5649eaa58c688526e65bd53af454404406666008...HEAD --name-only`
4. `make compile`
5. `make test`

Results:

1. `make compile` passed.
2. `make test` passed with `301 passing`.
3. I did not run Paddle sandbox end-to-end checkout or webhook tests because the branch still needs sandbox credentials and the frontend environment issue above would block a valid sandbox checkout.

## References

1. Paddle sandbox environment docs: https://developer.paddle.com/build/tools/sandbox
2. `Paddle.Environment.set()`: https://developer.paddle.com/paddlejs/methods/paddle-environment-set
3. `Paddle.Initialize()`: https://developer.paddle.com/paddlejs/methods/paddle-initialize
4. `Paddle.Checkout.open()` inline `frameTarget`: https://developer.paddle.com/paddlejs/methods/paddle-checkout-open
5. Paddle list customers exact `email` query: https://developer.paddle.com/api-reference/customers/list-customers

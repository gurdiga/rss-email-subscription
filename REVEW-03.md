# Review 03: PR #2

PR: https://github.com/gurdiga/rss-email-subscription/pull/2

Scope reviewed: third pass on the Stripe to Paddle migration after the `REVEW-01.md` and `REVEW-02.md` fixes, focused on Paddle's asynchronous checkout boundary, account state transitions, checkout event handling, and the new `PADDLE_ENVIRONMENT` configuration.

## Findings

1. **P1: Free-to-paid paths grant the paid plan before Paddle confirms payment**

   `src/api/registration.ts:71` stores the new account with the requested paid `planId`, then `src/api/registration.ts:104` creates the Paddle transaction and `src/api/registration.ts:116` initializes the session before the user has completed checkout. The same problem exists for free-to-paid plan changes: `src/api/account.ts:613` creates the transaction, but `src/api/account.ts:629` stores the new paid `planId` before the frontend opens and completes the Paddle checkout.

   The only authoritative Paddle success handler, `src/api/payment-integration.ts:455`, handles `transaction.completed` by storing card details only; it does not commit the plan or otherwise reconcile a pending purchase. Paddle's checkout success docs say `checkout.completed` is emitted after successful payment, recurring purchases create the subscription at that point, and the app should provision access then.

   Impact: if the user abandons checkout, payment fails, or the registration response cookie is used directly, the local account can keep paid entitlements without a Paddle subscription. This also leaves paid accounts in a half-created state when the webhook has not arrived yet.

   Recommendation:

   1. Store registration/free-to-paid purchases as `pending` until Paddle confirms them.
   2. Put the local `accountId` and target `planId` in Paddle `customData`, then make `transaction.completed` idempotently commit the plan.
   3. Keep frontend `checkout.completed` as UX feedback only; use the webhook or a server-side Paddle verification step as the authoritative transition.

2. **P1: Paid accounts can become unloadable while card details are missing or non-card**

   `src/api/account.ts:89` requires a card description for every subscription plan, and `src/api/account.ts:97` returns an app error if the description file is missing. In the Paddle flow, card details now arrive asynchronously in `src/api/payment-integration.ts:455`, and even that path writes the file only when `methodDetails.type === 'card'` at `src/api/payment-integration.ts:460`.

   Paddle checkout can present multiple payment methods unless constrained with `settings.allowedPaymentMethods`, and `src/web-ui/payment-integration.ts:56` does not set that option. So a successful non-card checkout, a delayed webhook, or a webhook without card details makes `/account` fail for an otherwise valid paid account.

   Recommendation:

   1. Stop treating missing `cardDescription` as an application error; return an empty or pending payment-method description instead.
   2. If the product requires card display, restrict checkout with `allowedPaymentMethods: ['card']`.
   3. Add coverage for loading a paid account before the webhook arrives and after a successful non-card or card-less webhook payload.

3. **P2: Checkout close/error paths can leave the submit flow hung**

   `src/web-ui/payment-integration.ts:115` registers an `eventCallback`, but it only resolves the pending checkout promise for `checkout.completed` and `checkout.error`. Paddle also emits `checkout.closed`, and `src/web-ui/shared.ts:257` keeps the submit button disabled until the handler promise settles. A closed checkout can therefore leave the UI stuck on `Wait...`.

   The error branch also reads `event.data?.error?.detail` at `src/web-ui/payment-integration.ts:129`, but Paddle's `checkout.error` event exposes `detail` at the event top level. That means real checkout errors are likely collapsed to the generic `Paddle checkout error`.

   Recommendation:

   1. Resolve `checkout.closed` as a user-cancelled input result and clear `currentCheckoutResolver`.
   2. Read `checkout.error` details from the documented top-level fields, with the existing generic message only as fallback.
   3. Wrap `Paddle.Checkout.open()` in `try`/`catch` or `asyncAttempt()` so synchronous open failures also re-enable the submit button.

4. **P2: `PADDLE_ENVIRONMENT` is typed but not validated at runtime**

   `src/api/init-app.ts:27` uses `requireEnv<AppEnv>()`, but `src/shared/env.ts:4` only checks that variables are present and casts the string. `src/api/payment-integration.ts:415` treats any value other than exactly `production` as sandbox, while the frontend only calls `Paddle.Environment.set('sandbox')` for exactly `sandbox` at `src/web-ui/payment-integration.ts:111`; any typo such as `prod` or `live` can split backend and frontend environments.

   Recommendation:

   1. Add a `makePaddleEnvironment()` parser for `sandbox | production`.
   2. Fail API startup when `PADDLE_ENVIRONMENT` is anything else.
   3. Test the parser and the `/payment-keys` response so the frontend never receives an invalid environment.

## Verification

1. `gh pr view https://github.com/gurdiga/rss-email-subscription/pull/2 --json title,number,state,baseRefName,headRefName,author,commits,files,url`
2. `gh pr view https://github.com/gurdiga/rss-email-subscription/pull/2 --comments`
3. `git diff --stat origin/main...HEAD`
4. `make compile`
5. `make test`

Results:

1. `make compile` passed.
2. `make test` passed with `301 passing`.
3. I did not run `make api-test` or a live Paddle sandbox checkout/webhook flow; those require a running local API plus valid Paddle sandbox credentials and webhook delivery.

## References

1. Paddle checkout success and provisioning: https://developer.paddle.com/build/checkout/handle-success-post-checkout
2. Paddle checkout settings, including `allowedPaymentMethods` and `transactionId`: https://developer.paddle.com/paddlejs/methods/paddle-checkout-open
3. Paddle.js checkout event list: https://developer.paddle.com/paddlejs/events/overview
4. `checkout.closed`: https://developer.paddle.com/paddlejs/general/checkout-closed
5. `checkout.error`: https://developer.paddle.com/paddlejs/general/checkout-error

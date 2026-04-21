# Review 04: PR #2

PR: https://github.com/gurdiga/rss-email-subscription/pull/2

Scope reviewed: fourth pass on the Stripe to Paddle migration after the `REVEW-03.md` fixes, focused on the new webhook-based plan commit path, pending checkout state, cancellation timing, and remaining test gaps.

## Findings

1. **P1: Abandoned paid registrations now leave a usable discontinued Free account**

   `src/api/registration.ts:66` still rejects direct Free-plan registrations because "The Free plan has been discontinued", but `src/api/registration.ts:249` now implements every registration by storing `PlanId.Free` at `src/api/registration.ts:258`. The endpoint then sends the confirmation email and initializes a session at `src/api/registration.ts:116`, while the paid plan is only applied later by `transaction.completed` in `src/api/payment-integration.ts:496`.

   That fixes the previous paid-without-payment grant, but it replaces it with a different bypass: a user can start paid registration, close or fail Paddle checkout, confirm the email, and keep an account on the discontinued Free plan. That plan is not inert; `src/domain/plan.ts:20` gives it real email limits.

   The stale integration test at `api-test.spec.ts:178` still expects the stored account to have the paid plan immediately after registration, so the current test suite also does not encode the new intended pending state.

   Recommendation:

   1. Add an explicit pending-registration or pending-payment state instead of overloading `PlanId.Free`.
   2. Do not grant feed-management access until payment is confirmed, or keep pending accounts unable to use plan limits.
   3. Update `api-test.spec.ts` to assert the pending state and the eventual `transaction.completed` promotion.

2. **P1: Webhook provisioning failures are acknowledged as successful deliveries**

   `src/api/payment-integration.ts:452` calls `handleTransactionCompleted(app, event.data)`, but the handler only logs failures. For example, if `storeAccount()` fails at `src/api/payment-integration.ts:511`, the code logs at `src/api/payment-integration.ts:514` and returns normally. `paddleWebhookHandler()` then always sends `200 OK` at `src/api/payment-integration.ts:458`.

   Now that `transaction.completed` is the authoritative plan-grant path, acknowledging a webhook after a transient local storage failure can permanently leave a paid customer on the Free plan. Paddle retries webhook delivery when the endpoint returns non-`200` or times out, but this code tells Paddle the event was successfully handled even when the local commit failed.

   Recommendation:

   1. Make `handleTransactionCompleted()` return a `Result` that distinguishes non-retriable payload issues from retriable internal failures.
   2. Return a non-`2xx` response when the local plan/card write fails, or persist the event to a durable queue first and acknowledge only after that enqueue succeeds.
   3. Add a test for a simulated `transaction.completed` where `storeAccount()` fails, asserting that the webhook endpoint does not return success.

3. **P2: Downgrades to Free schedule Paddle cancellation for later but revoke local access immediately**

   `src/api/payment-integration.ts:380` cancels Paddle subscriptions with `effectiveFrom: 'next_billing_period'`. Paddle keeps that subscription active until the current billing period ends. However, `requestAccountPlanChange()` stores `PlanId.Free` immediately afterward at `src/api/account.ts:622`, and `handleSubscriptionCanceled()` will not run until Paddle actually changes the subscription to canceled.

   This creates a local/Paddle mismatch for paid-to-Free changes: the customer keeps an active paid subscription in Paddle until period end, but the app downgrades them immediately. If immediate revocation is desired, the Paddle cancel request should use `effectiveFrom: 'immediately'`; if end-of-period access is desired, the app should store a pending cancellation and keep the paid plan until `subscription.canceled`.

   Recommendation:

   1. Choose immediate cancellation or end-of-period cancellation explicitly.
   2. For immediate cancellation, call Paddle with `effectiveFrom: 'immediately'` and keep the current local Free write.
   3. For end-of-period cancellation, keep the paid local plan until the `subscription.canceled` webhook arrives, and expose pending cancellation in account UI if needed.

## Verification

1. `gh pr view https://github.com/gurdiga/rss-email-subscription/pull/2 --json title,number,state,baseRefName,headRefName,author,commits,files,url`
2. `gh pr view https://github.com/gurdiga/rss-email-subscription/pull/2 --comments`
3. `git diff --stat origin/main...HEAD`
4. `make compile`
5. `make test`

Results:

1. `make compile` passed.
2. `make test` passed with `305 passing`.
3. I did not run `make api-test` or live Paddle sandbox checkout/webhook tests; those require a running local API plus valid Paddle sandbox credentials and webhook delivery.

## References

1. Paddle webhook delivery and retry behavior: https://developer.paddle.com/webhooks/respond-to-webhooks
2. Paddle cancel subscription API: https://developer.paddle.com/api-reference/subscriptions/cancel-subscription
3. Paddle cancellation behavior guide: https://developer.paddle.com/build/subscriptions/cancel-subscriptions
4. Paddle `subscription.canceled` timing: https://developer.paddle.com/webhooks/subscriptions/subscription-canceled

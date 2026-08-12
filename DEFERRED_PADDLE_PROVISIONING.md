# Create the Paddle customer at confirmation, not at registration

Plan written 2026-08-12. Everything below was checked against the tree and against prod; re-check anything that looks stale.

## What this changes for users, first

Signup goes from **register → pay** to **register → check email → confirm → pay**. Payment moves off the registration page and onto the confirmation page. That is a change on the money path, not a refactor: people who would have paid in the first thirty seconds now have to come back through an email. Everything below is mechanics; this sentence is the decision.

## Why

Registration provisions Paddle before the user has proved they own the email address. `initAccount` stores the account, then — for every subscription plan, which is all of them, since Free and SDE are rejected at registration — `createCustomerWithSubscription` creates a Paddle customer and a checkout transaction. Nothing removes those if the registration is never confirmed.

Prod on 2026-08-11, before the cleanup sweep ran: **69 accounts on `pending_payment`, 68 of them unconfirmed**. So deferring the Paddle call until after confirmation would have prevented roughly 99% of the residue. That number is the whole justification for this change, and it is measured, not assumed.

The sweep added in `ff7b215` deletes the stuck accounts but deliberately leaves Paddle alone, so the residue only grows: 70 customers and 29 draft transactions are sitting there now. Archiving them is possible but hazardous — it breaks re-registration unless `getOrCreatePaddleCustomer` is made archive-aware first. Not creating them is the cheaper answer.

One thing not understood: customers track registrations about 1:1, but there are only 29 draft transactions for 68 swept accounts. Either Paddle ages drafts out or some registrations failed between the two calls. It does not change the plan — the customer record is the thing that accrues, and that is what stops — but do not write a cleanup script that assumes one transaction per account.

Scope note: this addresses the Paddle residue, not the signups themselves. 63 junk registrations in June 2026 would still be created and still be swept, just without costing a Paddle record. Signup abuse is separate follow-up work.

## The blocking gap: the chosen plan is stored nowhere

`initAccount` writes `planId: PlanId.PendingPayment`. The plan the user actually picked survives only in Paddle’s transaction `customData.res_plan_id`, which is read back by `handleTransactionCompleted`. Defer the Paddle call and that information has to live somewhere of ours between registration and confirmation.

Two options:

1. **In `RegistrationConfirmationSecretData`.** It already carries `accountId` and `email`, is written at registration and read at confirmation, and `makeRegistrationConfirmationSecretData` is a two-line change. But `confirmAccountBySecret` deletes the secret, so a user who confirms and then abandons checkout leaves no record of what they wanted.
2. **A `requestedPlanId` field on the account.** Heavier — an `AccountData` addition, a `makeValues` entry in `loadAccount`, and tolerance for the 32 existing records that lack it — but it survives confirmation.

**Take option 2.** Under the new flow, “confirmed but not yet paid” stops being a rare accident and becomes the normal intermediate state that every single registration passes through. The record of what the user chose has to outlive the secret, or that state is a dead end.

## The dead end that has to be fixed in the same change

A confirmed `pending_payment` account currently cannot pay. In `requestAccountPlanChange`:

```
const changingFromOnePaidPlanToAnother = oldPlanId !== PlanId.Free;   // account.ts:657
```

With `oldPlanId` of `pending_payment` that is true, so the request takes the paid-to-paid branch at account.ts:681 and calls `changeCustomerSubscription`, which looks for an `active` or `trialing` subscription, finds none, and returns an `AppError`. The route is not behind `requirePaymentConfirmed` — it is registered at server.ts:121, before the middleware is even constructed at server.ts:134 — so the user reaches the endpoint and simply gets an error.

Today that is a rare corner. Under the new flow it is the only way back for anyone who confirms and abandons checkout, which will be a steady trickle. `requirePaymentConfirmed` also locks `pending_payment` accounts out of the feed endpoints, so such a user is shut out of the product with no route to pay.

Fix: treat `PendingPayment` like `Free` for this decision — no subscription exists yet, so it belongs on the `createCustomerWithSubscription` branch that returns a fresh checkout token, not the change-existing-subscription branch.

## The change

### Repo 1 — rss-email-subscription (API and web-ui TypeScript, manual deploy)

1. **`domain/account.ts` / `domain/account-storage.ts`** — add `requestedPlanId` to `Account` and `AccountData`, persist it in `storeAccount`, parse it in `loadAccount`. Must tolerate absence: all 32 existing accounts predate the field.
2. **`api/registration.ts`, `registration`** — store `requestedPlanId` from the request in `initAccount`. Leave the `createCustomerWithSubscription` block and the returned `paymentToken` alone for now; removing them is Phase 3, and doing it earlier is the silent-revenue-loss trap described under Sequencing.
3. **`api/registration.ts`, `registrationConfirmation`** — after `confirmAccountBySecret` succeeds, load the account, call `createCustomerWithSubscription` with `requestedPlanId`, and return the token in the response. A Paddle failure here must not un-confirm the account: confirm first, then attempt payment setup, and let the user retry through the account page if it fails.
4. **`domain/account.ts`** — add `paymentToken` to the registration-confirmation response type.
5. **`api/account.ts`** — route `PendingPayment` to the `createCustomerWithSubscription` branch in `requestAccountPlanChange`.
6. **`web-ui/registration.ts`** — remove `makePaymentSubformHandle` and `maybeConfirmPayment`; on success just reveal the “check your email” message.
7. **`web-ui/registration-confirmation.ts`** — add the subform handle and `maybeConfirmPayment`, driven by the token from the confirmation response. This page is currently a spinner and a message, so this is the largest single piece of new UI work.
8. **Specs** — `registration.spec.ts` for the response shape and the stored `requestedPlanId`; `account.spec.ts` for the `PendingPayment` plan-change branch; `account-storage.spec.ts` for round-tripping an account with and without `requestedPlanId`.

### Repo 2 — feedsubscription.com (markup, auto-deploys on push)

`website/html/` is gitignored here; the pages live in the sibling Eleventy repo at `~/src/feedsubscription.com`.

9. **`src/pages/user/registration-confirmation.njk`** — add the subform markup, mirroring registration.html:297-300 (`#payment-subform-container` hidden, `#payment-subform.paddle-checkout`). The confirmation page’s CSP already allows `https://*.paddle.com` in `script-src` and `frame-src`, so no CSP change is needed — verified, do not re-check.
10. **`src/pages/user/registration.njk`** — remove the subform markup.
11. **`src/web-ui-scripts/`** — copy the rebuilt web-ui JS across. Eleventy passes this directory through (`.eleventy.js:28`); confirm what performs the copy, because it is a manual step in the runbook.

## Sequencing

The two repos deploy differently — this one by hand, the website repo automatically on push — so the phases have to be independently safe. The governing rule: **the switch-over must be the last and smallest step, not the first.**

There is a trap that makes the obvious ordering wrong. `maybeConfirmPayment` returns early on a falsy token (payment-integration.ts:166-168), so it is tempting to have registration return `paymentToken: ''` early and call that graceful. It is not graceful. The old registration page does not distinguish a skipped checkout from a completed one — after `maybeConfirmPayment` returns it runs `hideElement(form)` and `unhideElement(confirmationMessage)` regardless (web-ui/registration.ts:146-163). The user is told they are signed up, and no payment is ever collected. Nothing errors and nothing is logged. That is silent revenue loss, and it would last for however long the confirmation-page UI takes to build — which this plan already identifies as the largest piece of work here.

So the phases are arranged to keep user-visible behavior unchanged until everything is in place:

**Phase 1 — API, deployed from here. No behavior change.** Land `requestedPlanId` persistence, the `requestAccountPlanChange` fix, and the confirmation endpoint creating the Paddle objects and returning a token. **Registration keeps calling `createCustomerWithSubscription` exactly as it does today.** The old registration page behaves identically; the old confirmation page ignores the new token field. Residue keeps accruing through this phase, which is fine — it has been accruing for months.

**Phase 2 — website repo, auto-deploys on push.** Subform markup moves from the registration page to the confirmation page, and the rebuilt web-ui JS goes across. The new flow now works end to end. Registration is still provisioning Paddle at this point, so between Phase 2 and Phase 3 each signup creates one customer and *two* draft transactions: one at registration that nobody opens, and one at confirmation that the user actually pays. `getOrCreatePaddleCustomer` reuses the existing customer by email rather than creating a second (payment-integration.ts:245-263), so this is one extra abandoned draft per signup and nothing worse. Keep the window short anyway.

**Phase 3 — one line, deployed from here.** Remove the `createCustomerWithSubscription` block from `registration`. This is the moment behavior actually changes, and it is a minutes-long deploy that can be reverted just as fast.

**Phase 4 — tidy-up.** Drop `paymentToken` from `RegistrationResponseData` once nothing reads it.

## Interaction with the cleanup sweep

The sweep needs no change and stays correct. Unconfirmed accounts will simply have no Paddle objects, so `cancelCustomerSubscription` returns `NothingToCancel` trivially and the skip-on-live-subscription guard never fires.

Known non-goal: the new **confirmed + `pending_payment` + never paid** population sits outside the sweep’s predicate, which requires `confirmationTimestamp === undefined`. Those accounts will accumulate. Deleting them is a different and more aggressive policy — they proved they own the address — so leave them, but expect them and decide later whether they deserve a nudge email rather than a sweep.

## Verification

`make pre-commit`, and `make app` before committing. Beyond that, the parts worth exercising by hand, because no unit test covers them:

- Register on a real plan and confirm the account is created with `requestedPlanId` and **no** Paddle customer appears.
- Confirm by email and check that the checkout opens on the confirmation page and that `transaction.completed` upgrades the plan off `pending_payment`.
- Abandon checkout at the confirmation step, then pay from the account page — this is the path that is broken today and the one most likely to regress.
- Round-trip an existing account that has no `requestedPlanId` and confirm `loadAccount` still parses it.

Sandbox is available: `PADDLE_ENVIRONMENT` supports it and the webhook already points at prod.

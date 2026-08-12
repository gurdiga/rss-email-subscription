# Create the Paddle customer at confirmation, not at registration

Plan written 2026-08-12, revised after review. Everything below was checked against the tree and against prod; re-check anything that looks stale.

## What this changes for users, first

Signup goes from **register → pay** to **register → check email → confirm → pay**. Payment moves off the registration page and onto the confirmation page. That is a change on the money path, not a refactor: people who would have paid in the first thirty seconds now have to come back through an email. Everything below is mechanics; this sentence is the decision.

## Why

Registration provisions Paddle before the user has proved they own the email address. `initAccount` stores the account, then — for every subscription plan, which is all of them, since Free and SDE are rejected at registration — `createCustomerWithSubscription` creates a Paddle customer and a checkout transaction. Nothing removes those if the registration is never confirmed.

Prod on 2026-08-11, before the cleanup sweep ran: **69 accounts on `pending_payment`, 68 of them unconfirmed**. So deferring the Paddle call until after confirmation would have prevented roughly 99% of the residue. That number is the whole justification for this change, and it is measured, not assumed.

The sweep added in `ff7b215` deletes the stuck accounts but deliberately leaves Paddle alone, so the residue only grows: 70 customers and 29 draft transactions are sitting there now. Archiving them is possible but hazardous — it breaks re-registration unless `getOrCreatePaddleCustomer` is made archive-aware first. Not creating them is the cheaper answer.

One thing not understood: customers track registrations about 1:1, but there are only 29 draft transactions for 68 swept accounts. Either Paddle ages drafts out or some registrations failed between the two calls. It does not change the plan — the customer record is the thing that accrues, and that is what stops — but do not write a cleanup script that assumes one transaction per account.

Scope note: this addresses the Paddle residue, not the signups themselves. 63 junk registrations in June 2026 would still be created and still be swept, just without costing a Paddle record. Signup abuse is separate follow-up work.

## The invariant

**No Paddle object exists for an email address until that address has been confirmed.** Everything below either implements that or protects it. The most valuable thing a reviewer can do is look for another route that reaches `createCustomerWithSubscription` without a `confirmationTimestamp`.

## The blocking gap: the chosen plan is stored nowhere

`initAccount` writes `planId: PlanId.PendingPayment`. The plan the user actually picked survives only in Paddle’s transaction `customData.res_plan_id`, which is read back by `handleTransactionCompleted`. Defer the Paddle call and that information has to live somewhere of ours between registration and confirmation.

Two options:

1. **In `RegistrationConfirmationSecretData`.** It already carries `accountId` and `email`, is written at registration and read at confirmation, and `makeRegistrationConfirmationSecretData` is a two-line change. But `confirmAccountBySecret` deletes the secret, so a user who confirms and then abandons checkout leaves no record of what they wanted.
2. **A `requestedPlanId` field on the account.** Heavier — an `AccountData` addition, a parse in `loadAccount`, and tolerance for the 32 existing records that lack it — but it survives confirmation.

**Take option 2.** Under the new flow, “confirmed but not yet paid” stops being a rare accident and becomes the normal intermediate state that every registration passes through. The record of what the user chose has to outlive the secret, or that state is a dead end.

## Four things that have to ship with this, not after it

These are not asides. Each one is load-bearing, and three of them were missed in the first draft of this plan.

### 1. The plan-change endpoint is a dead end for pending accounts

In `requestAccountPlanChange`:

```
const changingFromOnePaidPlanToAnother = oldPlanId !== PlanId.Free;   // account.ts:657
```

With `oldPlanId` of `pending_payment` that is true, so the request takes the paid-to-paid branch at account.ts:681 and calls `changeCustomerSubscription`, which looks for an `active` or `trialing` subscription, finds none, and returns an `AppError`. The route is not behind `requirePaymentConfirmed` — it is registered at server.ts:121, before the middleware is constructed at server.ts:134 — so the user reaches the endpoint and simply gets an error.

Today that is a rare corner. Under the new flow it is the only way back for anyone who confirms and abandons checkout. Fix: treat `PendingPayment` like `Free` here — no subscription exists yet, so it belongs on the `createCustomerWithSubscription` branch.

### 2. …and fixing it opens a hole straight through the invariant

`registration` calls `initSession` (registration.ts:116), so an unconfirmed registrant is *already authenticated*. `requestAccountPlanChange` never checks `confirmationTimestamp`. So the moment `PendingPayment` is routed to `createCustomerWithSubscription`, any client that registers and then POSTs the plan-change endpoint provisions a Paddle customer without ever opening the confirmation email — which is exactly the behaviour this whole change exists to stop, reachable by a bot in two requests.

Fix: reject that branch when `confirmationTimestamp` is absent. Worth a test whose name says so, because the fix and the hole are one line apart.

### 3. The account page hides the only control that reaches it

`fillUi` hides `changePlanButton` whenever the plan is `PendingPayment` (web-ui/account.ts:442-446) and labels the plan “Payment pending”. So the recovery path in item 1 has no UI at all — the endpoint would be correct and unreachable. `web-ui/account.ts` has to expose a checkout for confirmed pending accounts, or the retry story is fiction.

### 4. The confirmation email tells users they are finished

`makeRegistrationConfirmationEmailContent` says that clicking the link completes registration and that they will then be able to register a feed (registration.ts:201-204). After the cutover the link starts a checkout, and feeds stay blocked by `requirePaymentConfirmed` until payment lands. The copy has to change in the same phase as the behaviour.

## The change

### Repo 1 — rss-email-subscription: API *and* the web-ui bundle

The web-ui JS is **not** served by the website repo. `/web-ui-scripts/` is proxied to the API container (`website/nginx/conf.d/website.conf:56-59`), so the bundle ships with `make app start` from here, atomically with the API. The copy under the Eleventy repo’s `src/web-ui-scripts/` is not what production serves. This is the single most important fact for sequencing, and the first draft of this plan got it wrong.

1. **`domain/plan.ts`** — add `makeOptionalPlanId` alongside `makePlanId`, shaped like `makeOptionalEmailAddress` (email-address-making.ts:8).
2. **`domain/account.ts` / `domain/account-storage.ts`** — add `requestedPlanId` to `Account` (`PlanId | undefined`) and `AccountData` (`string | undefined`); persist in `storeAccount`, parse in `loadAccount` with the optional parser. `loadAccount` parses field by field rather than through `makeValues`. Must tolerate absence: all 32 existing accounts predate the field.
3. **`api/registration.ts`, `registration`** — store `requestedPlanId` in `initAccount`; remove the `createCustomerWithSubscription` block and stop returning a real `paymentToken`.
4. **`api/registration.ts`, `registrationConfirmation`** — after `confirmAccountBySecret` succeeds, load the account and call `createCustomerWithSubscription` with `requestedPlanId`. Return **both** `paymentToken` and `requestedPlanId`: `maybeConfirmPayment` takes a plan and silently no-ops when it is not a subscription plan (payment-integration.ts:156-168), and the account’s own `planId` is `pending_payment`, which would fail that test. Returning only the token would produce a page that opens no checkout and reports success.
   - **Legacy branch:** a confirmation secret issued before this deploys names an account with no `requestedPlanId`. Confirmation must still succeed — confirm, delete the secret, return no token — because those users were already charged at registration under the old flow. Never fail the confirmation over a missing plan; the secret is single-use and the user cannot retry.
   - A Paddle failure must not un-confirm the account. Confirm first, provision second, and let the user recover through the account page.
5. **`api/account.ts`** — route `PendingPayment` to the `createCustomerWithSubscription` branch, **and** reject it when `confirmationTimestamp` is absent (items 1 and 2 above).
6. **`web-ui/registration.ts`** — drop the payment subform handling and the `paymentSubform` entries from `requireUiElements`; on success just reveal the “check your email” message.
7. **`web-ui/registration-confirmation.ts`** — add the subform handle and `maybeConfirmPayment`, driven by the `paymentToken` and `requestedPlanId` from the response. Currently a spinner and a message, so this is the largest piece of new UI work.
8. **`web-ui/account.ts`** — expose a checkout control for confirmed `PendingPayment` accounts (item 3).
9. **`api/registration.ts`** — update the confirmation email copy (item 4).
10. **Specs** — `registration.spec.ts` for the response shape, the stored `requestedPlanId`, and the legacy no-plan confirmation path; `account.spec.ts` for the `PendingPayment` branch *and* its rejection when unconfirmed; `account-storage.spec.ts` for round-tripping with and without `requestedPlanId`.

### Repo 2 — feedsubscription.com: markup only (auto-deploys on push)

`website/html/` is gitignored here; pages live at `~/src/feedsubscription.com/src/pages/user/`.

11. **`registration-confirmation.njk`** — add the subform markup, mirroring registration.html:297-300 (`#payment-subform-container` hidden, `#payment-subform.paddle-checkout`). The page’s CSP already allows `https://*.paddle.com` in `script-src` and `frame-src` — verified, do not re-check.
12. **`registration.njk`** — remove the subform markup, *after* the cutover.

## Sequencing

Two repos, two deploy models: this one by hand and atomically (API and bundle together), the website repo automatically on push. Both directions of mismatch break something, because `requireUiElements` fails hard on a missing element and calls `displayInitError`:

- new JS + old markup → the confirmation page cannot find `#payment-subform` and dies on init
- old JS + markup already removed from the registration page → the registration page dies on init

So the markup goes first, additively, and is removed last:

**Step A — website repo, auto-deploys.** *Add* the subform markup to the confirmation page. Do not touch the registration page. The old confirmation JS never looks for the element, so this is inert in production.

**Step B — this repo, one atomic deploy.** Everything in items 1-10: the API changes and the rebuilt bundle ship together in the same image. Registration stops provisioning Paddle, confirmation starts, both pages get their new JS, the account page gets its recovery control, the email copy changes. This is the moment behaviour changes, and it reverts by redeploying the previous image.

**Step C — website repo, auto-deploys.** Remove the now-unused subform markup from the registration page.

There is no window in which Paddle is provisioned twice, and no window in which a page loads JS that its markup cannot satisfy. The cost is that Step B is a single big-bang switch of the money path rather than a gradual one — which is why the sandbox rehearsal below is not optional.

## Interaction with the cleanup sweep

The sweep needs no change and stays correct. Unconfirmed accounts will have no Paddle objects at all, so `cancelCustomerSubscription` returns `NothingToCancel` trivially and the skip-on-live-subscription guard never fires.

Known non-goal: the **confirmed + `pending_payment` + never paid** population sits outside the sweep’s predicate, which requires `confirmationTimestamp === undefined`. Those accounts will accumulate. Deleting them is a different and more aggressive policy — they proved they own the address — so leave them, but expect them and decide later whether they deserve a nudge email rather than a sweep.

## Verification

`make pre-commit` and `make app` before committing. Then rehearse the whole flow in the Paddle sandbox before Step B, because Step B switches the money path in one go:

- Register on a real plan; confirm the account stores `requestedPlanId` and that **no Paddle customer exists** for that email.
- Confirm by email; the checkout opens on the confirmation page and `transaction.completed` upgrades the plan off `pending_payment`.
- Abandon the checkout, then pay from the account page — broken today, and the path most likely to regress.
- Register, do **not** confirm, then POST the plan-change endpoint with the session registration handed out. No Paddle customer may appear. This is the invariant; test it deliberately.
- Confirm an account created before the deploy, with no `requestedPlanId`: confirmation must succeed rather than error on a consumed secret.

`PADDLE_ENVIRONMENT` supports sandbox and the webhook already points at prod.

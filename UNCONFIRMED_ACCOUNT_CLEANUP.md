# Unconfirmed accounts are never cleaned up

Handoff note. Everything here was verified against the tree at the time of writing; re-check anything that looks stale.

## The stuck state

An account whose registration was never confirmed stays in storage forever, and its email address becomes permanently unusable without operator intervention:

- `accountExists` is checked on registration regardless of confirmation state, so re-registering that address returns **"Email already taken"** (`src/api/registration.ts`).
- `checkCredentials` refuses to authenticate an account with no `confirmationTimestamp`, returning the "please click the registration confirmation link" branch before any password check (`src/api/authentication.ts`). So the user cannot log in.
- Account deletion needs an authenticated session (`deleteAccountWithPassword`) or shell access (`delete-account-cli`). With no session possible, the user cannot delete it either.

Nothing expires the account. `expireConfirmationSecrets` deletes confirmation **secrets** only — it never touches accounts — so the cron does not resolve this.

## How users get there

Two paths, both real:

1. **The confirmation link expires.** As of `176efb1` registration secrets expire after 48 hours like every other kind. Before that they were exempt and lived forever, so a user who found the email weeks later could still confirm. That escape hatch is now closed, which makes this path considerably more common.
2. **The confirmation email never arrives.** `initAccount` stores the account *before* `sendConfirmationEmail` runs, and the secret is stored only *after* the send succeeds. A send failure therefore leaves an account with no confirmation secret at all — unconfirmable from the first second, not merely after expiry. This predates the expiry change.

There is a narrow self-service window: registration calls `initSession`, so the user is logged in immediately afterwards, and `deleteAccountWithPassword` is not behind the `requirePaymentConfirmed` gate. So they can delete their own account until that session lapses. `sessionCookieMaxage` is 48 hours — the same as the secret lifetime — so in practice both doors close together.

## What a cleanup job has to handle

**Paddle subscriptions.** This is the part that is easy to miss. Registration creates the Paddle customer and subscription *before* confirmation, in the same request:

```
initAccount            → stores account with planId: PlanId.PendingPayment
sendConfirmationEmail
storeRegistrationConfirmationSecret
createCustomerWithSubscription  ← Paddle customer + subscription, for the requested plan
```

So an unconfirmed account can already have live billing attached, and the account record says `pending_payment` while Paddle holds the real plan.

Worse, the existing deletion path will **not** clean that up. `deleteAccountWithPassword` only calls `cancelCustomerSubscription` when `isSubscriptionPlan(account.planId)` is true, and `PendingPayment` is defined with `isSubscription: false` (`src/domain/plan.ts`). Deleting an unconfirmed account through the normal path therefore orphans its Paddle subscription silently. Any automated cleanup must cancel explicitly rather than reusing that guard — and it is worth checking whether the same hole affects manual deletions today.

**The confirmation secret**, if one exists. `delete-account-cli` does an `rmSync` of the account directory and nothing else, so a matching registration secret would linger until it expires on its own.

## Suggested approach

Extend `expireConfirmationSecrets` (`src/app/confirmation-secrets-expiration/`, cron `42 */6 * * *`): when deleting an expired secret of kind `RegistrationConfirmationSecretData`, also delete the account it names. `RegistrationConfirmationSecretData` carries both `accountId` and `email`, so no lookup is needed.

Guard rails worth having:

- **Re-read the account and confirm it is still unconfirmed before deleting.** The user may have confirmed between the secret being written and the sweep running. Deleting a confirmed account because its stale secret expired would be far worse than the problem being solved.
- **Never delete an account that has feeds or subscribers.** A confirmed account should not be reachable here at all, so if one is, the invariant is already broken — log loudly and skip rather than delete.
- **Cancel Paddle first**, and treat a cancellation failure as a reason to skip the deletion, not to proceed. An orphaned subscription bills a real person.

Path 2 above — an account with no secret at all — is not reachable from a secret-driven sweep, since there is no secret to expire. Either fix the ordering in `registration.ts` so the account is written only after the email is sent, or add a separate sweep for unconfirmed accounts older than the secret lifetime. The ordering fix is the better one and is small.

## Done when

- An unconfirmed account whose registration secret has expired is removed, along with its secret.
- A confirmed account is never removed, and there is a test that would fail if it were.
- Any Paddle subscription attached to the removed account is cancelled, verified against the `PendingPayment` / `isSubscription: false` trap above.
- Re-registering a previously-stuck address succeeds.
- `make test` and `make api-test` pass (`make api-test` needs `make start-api` in another terminal).

## Implementation plan

Written 2026-08-09 after checking prod. **This supersedes “Suggested approach” above** — the evidence says a secret-driven sweep cannot fix the accounts that are actually stuck.

### What prod looks like

100 accounts in `.tmp/docker-data/accounts`, and `/confirmation-secrets` holds **zero files**.

| creation | plan | confirmed? | count |
| --- | --- | --- | --- |
| 2026-06 | pending_payment | no | 63 |
| 2026-05 | pending_payment | no | 5 |
| 2023-06 | free | no | 2 |
| 2023-06 / 2024-02 | courage | no | 2 |
| 2023–2026 | free / sde / courage / pending_payment | yes | 28 |

None of the 72 unconfirmed accounts has any feed. 22 accounts have a `feeds/` directory at all; 16 have at least one feed.

Two things follow, and they set the shape of the whole change.

**A secret-driven sweep has nothing to iterate.** Since `176efb1`, `expireConfirmationSecrets` has been deleting registration secrets at 48 hours without touching accounts. Every unconfirmed registration since then is now an account with no secret, and no secret-keyed sweep will ever reach it again. Extending `expireConfirmationSecrets` would leave all 68 stuck accounts in place and only help future registrations. So sweep `/accounts` by age instead.

**`confirmationTimestamp === undefined` is not a safe predicate on its own.** The four pre-2026 unconfirmed accounts predate the confirmation flow and carry real plan IDs — two on `courage`, two on `free` — rather than `pending_payment`. An age-based sweep keyed only on the missing timestamp would delete accounts that have nothing to do with the flow this job exists to clean up. The sweep must also require `planId === PlanId.PendingPayment`, which excludes all four.

### Three corrections to the sections above

1. Registration does **not** create a Paddle subscription. `createCustomerWithSubscription` creates a customer plus `paddle.transactions.create` — a checkout. The subscription exists only after payment, which fires `transaction.completed` → `handleTransactionCompleted` → upgrade off `PendingPayment`. So the common stuck account holds a customer and a dead transaction and has nothing to cancel. The real billing hole is narrower than “Paddle subscriptions” above implies: transaction completed but webhook missed, leaving Paddle billing while `planId` stays `pending_payment`.

2. Guard rail “treat a cancellation failure as a reason to skip” is wrong as written. `cancelCustomerSubscription` returns `Err` for two *benign absences* — “Customer not found” and “No active subscription found to cancel”. Taken literally, the rule would skip essentially every account the sweep exists to delete.

3. Do not apply the preferred ordering fix in `registration.ts`. Moving `storeAccount` after the awaited email send reopens exactly the concurrent-registration race that the `existsAfterHashing` double-check at `registration.ts:264-275` was written to close — two registrations for one email could both write the account. Under an age-based sweep, path 2 is covered by age alone and `registration.ts` needs no change at all. (Storing the secret before the send, rather than after, would also cover path 2 without touching the race; it is redundant here and left out.)

### The change

**1. `src/api/payment-integration.ts` — separate absence from failure.** Add a `NothingToCancel` sentinel following the `CustomerNotFound` / `hasKind` idiom already in that file, and return it from the two absence branches instead of `makeErr`. Update both existing callers so behaviour is unchanged: `deleteAccountWithPassword` keeps warn-and-proceed on a real `Err` and logs info on `NothingToCancel`; `requestAccountPlanChange` on the paid→free path treats `NothingToCancel` as an error, because there a missing subscription really is one.

**2. New `src/app/unconfirmed-accounts-cleanup/index.ts`.**

```ts
export async function deleteStaleUnconfirmedAccounts(
  storage: AppStorage,
  paddle: Paddle,
  cancelFn = cancelCustomerSubscription
): Promise<void>
```

It returns its promise, unlike `expireConfirmationSecrets` — whose spec drains with `setImmediate` on the assumption that everything inside is synchronous I/O. Adding awaited Paddle calls to that function would break the assumption quietly, with the test still passing on pre-deletion state. `cancelFn` is injected in the style of `loadFeedFn = loadFeed`, keeping tests off the network.

Iterate with `getAccountIdList`, not `getAllAccountIds`. The latter aborts the entire sweep with `makeErr` if any one subdirectory name fails `makeAccountId`; the former returns `{accountIds, errs}` and lets the run continue past a single bad name. For an unattended job over a directory that has accumulated whatever it has accumulated, the forgiving one is the right default — log the `errs` and carry on.

Delete only when every condition holds:

1. `loadAccount` succeeds and is not `AccountNotFound` — otherwise log and skip.
2. `account.confirmationTimestamp === undefined`.
3. `account.planId === PlanId.PendingPayment` — the guard that spares the four legacy accounts.
4. `account.creationTimestamp` older than `confirmationSecretLifetimeMs` (48h). With the job on a 6-hour tick, effective deletion lands at 48–54 hours. Past 48 hours the confirmation link is dead anyway, so holding the account longer only prolongs the “Email already taken” lockout.
5. `loadFeedsByAccountId` returns no `validFeeds` **and** no `errs` / `feedIdErrs`. A confirmed account should be unreachable here, so a feed found at this point means the invariant is already broken: `logError` and skip. Anything unreadable is likewise a skip — never delete on ambiguity.
6. `await cancelFn(paddle, account.email)`, branching three ways:
   - `NothingToCancel` → log info and **proceed**. This is all 68 accounts on prod today.
   - `Err` → log error and **skip**. An orphaned subscription bills a real person.
   - **Success → log error and skip as well.** A successful cancel means Paddle held an `active` or `trialing` subscription, which per correction 1 is only reachable through the missed-webhook hole — that is evidence the account model is wrong, not a green light. And the cancel is `effectiveFrom: 'next_billing_period'` (`payment-integration.ts:414`), so cancel-then-delete would leave a real person billed to period end with no account, and the eventual `subscription.canceled` webhook would find nothing to downgrade. Skipping makes the sweep structurally incapable of deleting a billing account, which is a stronger property than cancelling first.
7. Re-load the account and re-check conditions 2 and 3. The Paddle call is awaited, so a confirmation can land during it — same hazard the comment at `account.ts:300-303` describes. Changed → warn and skip.
8. `deleteAccount(storage, accountId)`.

Log a final count, and wrap in `return logDuration(...)` — with the `return`. `logDuration` does await its callback and propagate the result (`logging.ts:83-96`), but `expireConfirmationSecrets` calls it without returning, which is precisely why its spec needs the `setImmediate` drain. Copying that shape here would hand the spec a promise that resolves before any deletion has happened, and the assertions would then run against pre-deletion state and pass — the exact failure this module is structured to avoid.

Condition 5 needs no existence guard of its own: `loadFeedsByAccountId` already checks `storage.hasItem` on the feeds root and returns empty results when it is absent (`feed-storage.ts:154-162`), so it never reaches `listSubdirectories` for the 68 accounts that have no `feeds/` directory. The dead check in `listSubdirectories` noted below is therefore genuinely unrelated, not a dependency of this change.

**Known residue, deliberately left alone: orphaned Paddle customers.** The sweep removes the local account but not the Paddle customer record created at registration, so 68 orphaned customers stay behind and the count keeps growing. Decision: leave them.

Paddle offers no delete — `Status` is `'active' | 'archived'` and the only removal is `customers.archive(customerId)`. The residue is functionally inert: customers cost nothing, `findPaddleCustomerByEmail` queries `list({email})` so growth never degrades the lookup, and re-registration works precisely *because* the customer is reused. The one real argument for cleaning up is data minimization — holding an email in Paddle for someone whose local account was deleted — and that argument weighs very differently against 63 apparent bot signups than against a person whose confirmation email bounced.

Archiving is not free, either. It breaks re-registration on both branches: if `list({email})` returns archived customers, `getOrCreatePaddleCustomer` hands back an archived one and `transactions.create` rejects it; if it does not, the code falls through to `customers.create` and hits Paddle’s email-uniqueness constraint. Which branch Paddle actually takes is unverified — `status` is optional on `ListCustomerQueryParameters` and the API default is not documented in the SDK types.

So if this is ever revisited, the order is: make `getOrCreatePaddleCustomer` archive-aware first (query `status: ['active', 'archived']` explicitly, reactivate via `customers.update(id, {status: 'active'})` when the match is archived), verify it in the Paddle sandbox by archiving a customer and re-registering that email, and only then add `customers.archive` to the sweep — after the local delete, with failure as log-and-continue, because a Paddle archive failure must never block or reverse a local deletion. The existing 68 would want a one-off script rather than the sweep.

The root cause is worth naming even though it is out of scope: this residue exists only because registration provisions Paddle *before* the user confirms anything. Moving `createCustomerWithSubscription` to after registration confirmation would mean unconfirmed accounts never touch Paddle at all — no residue, no cleanup code, no archive-awareness. That is a product-visible change to the signup flow (signup → confirm → pay rather than signup → pay), which is why it is not part of this.

Each stuck registration also left a `draft` or `ready` checkout **transaction** behind. Those are more visible in the Paddle dashboard than the customer records and may turn out to be the part that actually matters.

**3. `src/app/cron.ts` — wire it up.** Add `PADDLE_API_KEY` and `PADDLE_ENVIRONMENT` to `requireEnv` (`cron.ts:23`) and validate the latter with `makePaddleEnvironment`, mirroring `init-app.ts:42`; cron does no validation today. Both vars already reach the container through `*app-env`, so `docker-compose.yml` needs no change. Build the Paddle client once in `main` and pass it in. Schedule at `52 */6 * * *` — deliberately *after* the secret expiry at `42 */6`, not before. Running it first would open a 25-minute window where the account is gone but its secret is not, and `confirmAccountBySecret` would then report success on a dead account (see the unrelated findings below). `cron-cli.ts` keeps its narrower `requireEnv`; it never calls the sweep, and the Makefile only invokes it for `rss-checking` / `email-sending`.

**4. `src/shared/test-utils.ts`.** `makeTestAccount` accepts `planId` and `confirmationTimestamp` in its `Partial<AccountData>` but hardcodes `PlanId.Free` and `undefined` in the `Account` it returns. Honour both overrides. Low risk — `account.spec.ts` re-overrides after the spread — but re-run `make test` to confirm nothing was leaning on the old behaviour.

**5. `src/app/unconfirmed-accounts-cleanup/index.spec.ts`**, with a stub `cancelFn`:

- deletes an old unconfirmed `PendingPayment` account
- **does not delete a confirmed account**
- **does not delete an old unconfirmed account on a non-`PendingPayment` plan** — the regression test that guards the legacy accounts
- does not delete an unconfirmed account younger than 48 hours
- does not delete an account that has feeds
- does not delete when `cancelFn` errs, nor when it succeeds; deletes only on `NothingToCancel`
- calls `cancelFn` with the account email before deleting

Seed the snapshot with at least one account. `listSubdirectories` returns `Err` rather than `[]` for a missing directory (see unrelated findings), so a “no accounts” case on an empty snapshot would pass for the wrong reason.

### How this satisfies “Done when”

The unconfirmed account is removed by the sweep; its secret, when one exists, is removed by the existing expiry job running ten minutes earlier — and for the 68 on prod today there is no secret at all. A confirmed account is never removed, and both the confirmed-account test and the non-`PendingPayment` test would fail if that broke. Paddle is handled by skipping rather than by cancelling, which sidesteps the `PendingPayment` / `isSubscription: false` trap entirely instead of working around it. Re-registering a stuck address succeeds by construction once `accountExists` returns false — note that no api-test can cover this end to end, because the cron container does not run under `make start-api`; the coverage is the sweep’s unit test plus the existing registration tests.

### Before deploying

The first cron tick after deploy deletes 68 prod accounts irreversibly.

1. Write a throwaway ts-node script that applies conditions 1–5 against an rsynced copy of prod data and prints email, plan, and creation timestamp. Same predicate, no production surface, and no `dryRun` flag in shipped code. Diff its output against the table above.
2. Check Paddle for live subscriptions among those 68 emails. Condition 6 should hit `NothingToCancel` for every one of them; anything else is the missed-webhook hole, better seen deliberately than as a skipped deletion at 02:52.
3. Then `make app start` on prod.

## Unrelated findings worth attention

None of these is caused by this change, and none is fixed by it.

**Four accounts have no `confirmationTimestamp` and so can never be logged into.** `checkCredentials` refuses any such account (`authentication.ts:76-85`). Checked against Stripe on 2026-08-10 — these predate Paddle, which replaced Stripe in `4c63080` on 2026-05-19 with no customer migration, so Paddle knows nothing about any of them:

| plan | created | email | Stripe |
| --- | --- | --- | --- |
| courage | 2024-02-13 | don-san-talks@pm.me | customer + cancelled subscription, **no charges ever** |
| free | 2023-06-13 | aglae25@hotmail.com | no customer |
| free | 2023-06-07 | jokaing@outlook.com | no customer |
| courage | 2023-06-23 | test@gurdiga.com | own test account |

None of them is a locked-out paying customer, which was the initial reading and was wrong. `don-san-talks@pm.me` is a typo: that address registered at 23:26:35, and `don-san-talk@pm.me` — same Mastercard ••••9634 — registered at 23:29:27 and confirmed 18 seconds later. The working account paid twice, $5 in March and $5 in April 2024, and its subscription is cancelled now. The unconfirmed twin was never charged. Its `courage` planId is stale local state from a Stripe subscription that was created and cancelled without ever billing.

So there is nothing to repair here. If anything these four are deletion candidates, not backfill candidates — and the sweep will not touch them, because none is on `pending_payment`.

**`confirmAccountBySecret` reports success on a deleted account.** It checks `isErr(confirmAccountResult)` at `registration.ts:361` but not `isAccountNotFound` — and `confirmAccount` returns `AccountNotFound`, which is not an `Err`. So a confirmation link whose account is gone deletes the secret, calls `initSession` on a dead `accountId`, and tells the user “Account registration confirmed.” Scheduling the sweep after the secret expiry keeps this change from widening the window, but the missing check is independently wrong.

**`listSubdirectories` has a dead existence check.** At `storage.ts:214-233` it computes `fileExistsResult`, returns early only if that *errored*, and then never consults the boolean. A missing directory therefore falls through to `readdir` and comes back as `Err` instead of `[]`. `checkFeeds` already hits this hourly on a fresh install.

**`delete-account-cli` is `rmSync`-only.** It removes the account directory and nothing else: no Paddle cancellation, no confirmation-secret cleanup. This is the “worth checking whether the same hole affects manual deletions” question above, and the answer is yes.

**63 unconfirmed registrations in June 2026 alone**, against roughly 30 real accounts accumulated over three years, all `pending_payment`, none with a feed. That shape looks like automated signups rather than lapsed users. It is what makes the cleanup urgent, and it may deserve its own answer.

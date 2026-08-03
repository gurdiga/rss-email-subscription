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

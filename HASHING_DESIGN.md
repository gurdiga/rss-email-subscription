# Password Hashing & Crypto Concentration — Design

Status: implemented (pending commit/deploy). Scrypt `N` benchmarked on prod and set to 32768 — see §1.

## Context

A security audit of this codebase (session covering IDOR/access-control review, plus two shipped fixes — the confirmation-secret path-traversal rejection and the password-hash log leak) surfaced a deeper structural issue in how the app handles secrets: **crypto concentration**. This document proposes a design to fix it. It does not implement anything — implementation is a separate follow-up task.

### Current state

All of the following is verified against the code as of this writing:

- `src/shared/crypto.ts`: `hash(input, salt) = sha256(input + salt).hex()`. Fast, no work factor, no per-call randomness. This is fine for non-secret identifiers but is a poor primitive for password storage.
- `src/domain/app-settings.ts`: a single global secret, `settings.hashingSalt` (16 characters, stored in `/settings.json` in the data volume), is provisioned by hand — `make hashing-salt` just prints a random string for a human to paste in. There’s no rotation tooling and no env-var injection path for it.
- `src/domain/account-crypto.ts` uses that _same_ global secret as the root key for four unrelated purposes, via naive string concatenation as “domain separation”:
  1. `getAccountIdByEmail(email, salt)` = `hash(email, salt)` — becomes the account’s storage-path identifier.
  2. `makeRegistrationConfirmationSecretHash(email, salt)` = `hash(email, 'registration-confirmation-secret-' + salt)`
  3. `makeEmailChangeConfirmationSecretHash(email, salt)` = `hash(email, 'email-change-confirmation-secret-' + salt)`
  4. `makePasswordResetConfirmationSecretHash(email, salt)` = `hash(email, 'password-reset-confirmation-secret-' + salt)`
- Password hashing itself, separately, also calls `hash(password, settings.hashingSalt)` directly, at five call sites: `src/api/authentication.ts` (login), `src/api/account.ts` (change password, delete-account confirm — two sites), `src/api/password-reset.ts` (reset), `src/api/registration.ts` (register). Same global secret again, no per-user salt at all. **Two users with the same password get a byte-identical `hashedPassword.value`.**
- `src/domain/hashed-password.ts` validates `HashedPassword.value` as exactly 64 characters — a raw SHA-256 hex digest, no algorithm tag, no charset check (so today even `'x'.repeat(64)` passes).
- Comparisons are plain `!==`/`===` throughout (`authentication.ts:86`, `account.ts:250`, `account.ts:457`) — no `crypto.timingSafeEqual` anywhere in the codebase.

### Why “concentration” is the real finding, not just “weak hash”

Items 2–4 above are **deterministic**: given an email address, the “secret” is always the same value. They are looked up in `src/domain/confirmation-secrets-storage.ts` purely as a lookup key into a store that already carries all the purpose-specific data (`accountId`, `newEmail`, `timestamp`). The secret value itself never needed to be _derived_ from anything — it only needs to be unguessable.

That means a single 16-character value, if it ever leaks (config backup, misconfigured log, a bug like the traversal issue just fixed, a careless `git add`), hands an attacker:

- A password-cracking assist — same salt reused across every account means one precomputation attacks all accounts at once, and identical passwords across accounts are instantly visible as identical hashes.
- The ability to **forge valid registration-confirmation, password-reset, and email-change links for any email address**, without ever touching that person’s inbox. This is full account takeover on demand, not a cracking exercise — it doesn’t even require the password hash to be weak.
- The ability to compute any account’s storage-path identifier (`getAccountIdByEmail`), enabling direct targeting of that account’s directory.

So the weak password hash and the deterministic confirmation secrets are two symptoms of one root cause: **one secret is quietly load-bearing for everything**. Fixing only the password hash (e.g. swapping in a strong KDF) would leave the more severe problem — deterministic, forgeable account-takeover links — completely untouched. The design below fixes both, and treats killing the determinism as the higher-priority half.

## Goals

1. Password hashes must not be crackable in bulk from a single leaked value, and must not reveal which accounts share a password.
2. A leaked `hashingSalt` must not, by itself, allow forging a confirmation/reset/email-change link for an arbitrary account.
3. No new npm dependencies, no Dockerfile changes, unless clearly justified — this is a small, self-hosted, single-VPS app, and the codebase already leans hard on Node built-ins (see `crypto.randomBytes` in `shared/crypto.ts`, `feed-crypto.ts`).
4. No forced mass password reset. Existing users should not notice the migration.
5. No `account.json` schema changes beyond what the existing `isAdmin` precedent already establishes as safe (optional field, defaulted on load).

## Non-goals

- Full secrets-management overhaul (secret rotation tooling, external secrets manager, multiple independently-provisioned secrets). This app has one manually-edited JSON secret file and no infra for more; proposing a bigger apparatus here would be solving a problem the deployment doesn’t have yet.
- Rate limiting on auth endpoints. Real gap (no `express-rate-limit` or similar exists in `server.ts` today), but orthogonal to hashing — flagged below as a fast-follow, not in scope here.
- Changing password complexity rules (`src/domain/password.ts`, `src/domain/new-password.ts`).

## Design

### 1. Password hashing algorithm

The Docker build constraint decides this: `docker-services/app/Dockerfile` builds `node:22.22-alpine3.23` with only `apk add openssl busybox` + `npm ci` in the build stage — no C/C++ toolchain (no `python3`, `make`, `g++`, `build-base`). Native npm modules requiring compilation (`bcrypt`, default `argon2`) would fail to install as-is. A prebuilt-binary package (e.g. `@node-rs/argon2`) might sidestep that, but it’s a new dependency with unconfirmed musl/Alpine prebuild support, added purely for a hobby-scale app — against Goal 3.

**Recommendation: Node’s built-in `crypto.scrypt`**, used via its **promisified async form**, not `scryptSync`. `checkCredentials` in `authentication.ts` is currently synchronous; a sync scrypt call would block the single Node event loop for the full KDF cost on _every_ login — the opposite of what you want once hashing is deliberately expensive. Making `checkCredentials` async is a small, contained change (its one caller is already in an async handler).

**Chosen parameters (benchmarked on prod): `N=32768 (2^15), r=8, p=1, keylen=64`.** Cost is `128 * N * r` = 32 MiB, which equals Node’s default `maxmem` cap and would throw `memory limit exceeded`, so `scryptDerive` passes an explicit `maxmem = 128 * N * r * 2` (64 MiB); any future bump to `N` is therefore an in-code change, not an infra one.

Benchmark on the prod box (DigitalOcean `DO-Regular`, **single vCPU**, Node 22), 15 iterations after a warmup, median per-hash wall time:

| N                | memory  | median     | mean   | range   |
| ---------------- | ------- | ---------- | ------ | ------- |
| 16384 (2^14)     | 16 MiB  | 68 ms      | 84 ms  | 63–229  |
| **32768 (2^15)** | 32 MiB  | **135 ms** | 136 ms | 122–154 |
| 65536 (2^16)     | 64 MiB  | 273 ms     | 283 ms | 254–420 |
| 131072 (2^17)    | 128 MiB | 560 ms     | 581 ms | 527–762 |

`N=32768` lands squarely in the 100–250 ms interactive-login target band; 16384 is below it and 65536 overshoots. Re-benchmark if the droplet is resized. Note the box has **only one vCPU**: the default libuv threadpool is 4, but concurrent logins still contend for that single core, so a burst serializes at ~135 ms each — see the DoS note below; rate-limiting the auth endpoints is the real mitigation, not a lower `N`.

### 2. Storage format

Keep `HashedPassword.value` a single string — no `AccountData`/`account-storage.ts` schema change needed (`loadAccount`/`storeAccount` already treat it as opaque). New encoding, PHC-like:

```
scrypt$v1$N=32768,r=8,p=1$<saltHex>$<hashHex>
```

Replace the current fixed-length-only check in `src/domain/hashed-password.ts` (`length === 64`, no charset check) with a parser recognizing two shapes:

- **legacy**: exactly 64 characters matching `/^[0-9a-f]{64}$/` (a raw SHA-256 digest).
- **new**: the `scrypt$v1$...` structure above (numeric params, hex salt, hex digest).

Tightening legacy recognition to `[0-9a-f]{64}` (rather than “any 64 characters”, which is what passes today) is consistent with the charset restriction already added to `makeConfirmationSecret` in the traversal fix, and has the same small, known blast radius: five test fixtures currently use `'x'.repeat(hashedPasswordLength)` (`src/shared/test-utils.ts:152`, `src/domain/account-storage.spec.ts:63,98,140,161`) and need to switch to a hex fixture. Both shapes are accepted by `makeHashedPassword`; a separate `parseHashedPassword` (used only by verification) distinguishes them.

### 3. Per-user salt

Generated via `crypto.randomBytes(16)` inside a new `hashPassword()`, at hash time, embedded in the encoded string above. Never derived from `settings.hashingSalt` or from anything else — purely random, purely per-call.

### 4. Migration: lazy rehash-on-login

A forced reset means emailing every user and locking them out until they act — disruptive, for no correctness gain. Lazy rehash-on-successful-login is the standard, zero-disruption pattern, and fits Goal 4 directly.

Centralize the logic in `src/domain/hashed-password.ts` (or a new sibling `src/domain/password-hashing.ts`):

- `hashPassword(plain: string): Promise<HashedPassword>` — always writes the _new_ format.
- `verifyPassword(plain: string, stored: HashedPassword, globalSalt: string): Promise<boolean>` — dispatches on the stored format: legacy → `hash(plain, globalSalt)` + constant-time compare; new → scrypt with the embedded params/salt + constant-time compare.

`checkCredentials` in `authentication.ts` calls `verifyPassword`. On success, if the matched format was legacy, immediately call `hashPassword(plain)` and persist it via `storeAccount(storage, accountId, { ...account, hashedPassword: newHash })` — the same store-on-success pattern already used for password changes (`account.ts:265`).

The other four call sites just switch from `hash(pw, settings.hashingSalt)` to `hashPassword(pw)` and always produce the new format going forward; only the login path needs dual-format _read_ support:

- `account.ts:258` (change password) — write path, switch to `hashPassword`.
- `account.ts:250`, `account.ts:457` (change-password verify, delete-account verify) — read/compare path, switch to `verifyPassword`.
- `password-reset.ts:190` — write path, switch to `hashPassword`.
- `registration.ts:256` — write path, switch to `hashPassword`.

**Demo account.** `authentication.ts` has no demo-specific branch today — `checkCredentials` never writes to storage at all currently, so this rehash-on-login write would be the _first_ mutation login ever performs. Elsewhere, demo-account mutations are consistently suppressed (`account.ts:141,265,476`, `feeds/add-new-feed.ts:50,65` all guard on `isDemoSession(reqSession)`). For consistency with that established pattern — and so the demo account’s `account.json` stays static, as it evidently is meant to — the rehash-and-store step should skip persistence when `isDemoSession(reqSession)` is true, while still letting the demo account authenticate via the legacy-format path indefinitely.

### 5. Killing deterministic confirmation secrets

Replace the three `hash(email, purpose + salt)` derivations in `account-crypto.ts` with a single random-token generator: `crypto.randomBytes(32).toString('hex')`, generated fresh at request time.

This requires **zero changes** to `src/domain/confirmation-secrets-storage.ts` — it already treats the secret purely as an opaque lookup key, storing the purpose-specific payload (`accountId`, `newEmail`, `timestamp`) alongside it. It also requires **zero changes** to `src/domain/confirmation-secrets.ts`: `confirmationSecretLength = 64` matches `randomBytes(32)` → hex exactly, and the hex-charset restriction added in the traversal fix (`/^[a-f0-9]+$/`) already accepts precisely this output.

Two call sites already generate the secret once and thread it through to both storage and the outgoing email, so the fix there is a one-line swap of the derivation call:

- `password-reset.ts`
- `account.ts::requestAccountEmailChange`

`registration.ts` needs a slightly larger refactor: today it derives the secret **twice independently** — once at line 91 for storage, once inside `makeRegistrationConfirmationEmailContent` (called via `sendConfirmationEmail` at line 171) — and relies on determinism for the two calls to agree. (Confirmed: there’s no separate “resend confirmation” endpoint, so this is the only place that double-derivation pattern occurs.) Fix: generate the secret once in the handler, thread it into `sendConfirmationEmail(..., secret)` → `makeRegistrationConfirmationEmailContent(recipient, secret, domainName)` (dropping its `hashingSalt` parameter), and into `storeRegistrationConfirmationSecret`.

Open question: where should the new `makeRandomConfirmationSecret()` helper live? `confirmation-secrets.ts` is arguably the better home now — it no longer needs an email or account input, so it doesn’t belong in `account-crypto.ts` anymore.

### 6. What remains of the global secret

After (5), `settings.hashingSalt`’s only remaining consumer is `getAccountIdByEmail`.

**Recommendation: leave it exactly as-is. Don’t introduce HKDF or a second secret for this.** This isn’t just “simplest option wins” — `getAccountIdByEmail`’s output is baked into the on-disk directory path of every existing account. Changing its derivation at all, including swapping in an HKDF sub-key, breaks discovery of every account directory that already exists. Unlike password rehashing, that’s not a lazy per-login migration — it’s a forced filesystem migration across every account, with a real risk of locking out accounts if it goes wrong. The marginal security gain doesn’t justify that: a leaked `hashingSalt` under this design only lets an attacker compute a non-secret, pseudonymous path segment for an email they’d need to already know and already be targeting — no cracking or account-takeover shortcut results from it anymore, because (5) already removed the actual sensitive derivations.

`src/domain/account-crypto.spec.ts` already hardcodes an expected output for `getAccountIdByEmail` — that test is a good regression anchor proving this derivation stays byte-identical through this change.

Flagged as genuinely open, not decided here: if a future feature needs another value derived from this secret, HKDF is worth adopting _then_, before a second naive-concatenation consumer appears — not preemptively now for a consumer count of one.

### 7. Constant-time comparison

Add to `src/shared/crypto.ts`:

```ts
export function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');

  if (bufA.length !== bufB.length) {
    return false; // digests are fixed-length by construction; this is defensive only
  }

  return crypto.timingSafeEqual(bufA, bufB);
}
```

Used inside `verifyPassword` to compare the parsed _digest_ portion (not the whole encoded string, which includes non-secret params) against the freshly computed one. Replaces the plain `!==`/`===` comparisons at `authentication.ts:86`, `account.ts:250`, `account.ts:457`.

## Operational considerations

Moving verification onto `crypto.scrypt`’s async form runs it on the libuv threadpool rather than the main event loop, so concurrent-login cost is bounded by `UV_THREADPOOL_SIZE` (default 4) rather than serializing everything behind one blocking call — a real mitigation, and tunable later via `NODE_OPTIONS`/env if benchmarking shows contention (there’s already a `NODE_OPTIONS` line in the Dockerfile for `--dns-result-order`, so adding `UV_THREADPOOL_SIZE` alongside it is a precedented, small change if ever needed).

That said: login, registration, and password-reset-request are unauthenticated, internet-reachable endpoints, and this deployment is a single non-autoscaled VPS. Moving from an essentially free hash to a deliberately expensive one changes their DoS profile — an attacker hammering `/authentication` now costs the server real CPU/memory per attempt. Pick `N` conservatively and measure. Rate-limiting these endpoints is a separate, pre-existing gap (confirmed: no `express-rate-limit` or equivalent in `server.ts` today) — worth doing, but out of scope for this design; flagging it here so it isn’t forgotten.

## Testing / verification plan

- No `hashed-password.spec.ts` exists today — add one covering: legacy-format acceptance, new-format acceptance, rejection of garbage/malformed input for both shapes.
- Add `hashPassword`/`verifyPassword` round-trip tests.
- Add the key behavioral regression test: a stubbed legacy-format account logs in successfully and triggers exactly one `storeAccount` rewrite to the new format — and zero further rewrites on a subsequent login with the same (now-migrated) account.
- Add a demo-account variant of that test asserting no rewrite happens when `isDemoSession` is true.
- Add `timingSafeEqualHex` tests (equal, unequal, length-mismatch) in a new `src/shared/crypto.spec.ts`.
- `confirmation-secrets.spec.ts` / `confirmation-secrets-storage.spec.ts` need no changes for this work; add one test asserting the new random-secret generator’s output satisfies `makeConfirmationSecret`.
- Update the five `'x'.repeat(hashedPasswordLength)` fixtures (`test-utils.ts:152`, `account-storage.spec.ts:63,98,140,161`) to a valid hex string, same pattern as the fixture fix already done for confirmation secrets in the traversal-fix commit.
- Run via `make test` (mocha/chai — no jest in this repo).
- Manual smoke test against dev docker-compose: register → confirm → login → change password → reset password, inspecting `/accounts/<id>/account.json` before/after each step to confirm the format transitions land where expected.

## Open questions for implementation time

1. ~~**`N` parameter for scrypt** — needs benchmarking against the actual VPS.~~ Resolved: benchmarked on prod, set to `N=32768` (~135 ms/hash). See §1.
2. **Demo account rehash exemption** — recommended above (skip persistence, consistent with existing `isDemoSession` guards elsewhere), but worth confirming explicitly rather than assuming.
3. **Home of the new random-secret generator** — proposed as `confirmation-secrets.ts` rather than `account-crypto.ts`, since it no longer takes an email/account argument.

## Explicitly out of scope

- Rate limiting on auth endpoints.
- Secret rotation tooling / external secrets manager.
- A server-side password “pepper” independent of the data volume (would meaningfully help only if the data volume and the app’s secret storage have different trust boundaries, which they currently don’t — same host, same operator).
- Changing password complexity rules.

## File-by-file summary

| File                                                                   | Change                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/shared/crypto.ts`                                                 | Add `timingSafeEqualHex`.                                                                                                                                                                                                                                          |
| `src/domain/hashed-password.ts`                                        | Replace fixed-length check with a two-shape (legacy / `scrypt$v1$...`) parser; add `hashPassword`/`verifyPassword` (or a new sibling module — see open question 3’s sibling naming choice for confirmation secrets, same judgment call applies here if preferred). |
| `src/domain/account-crypto.ts`                                         | Drop the three confirmation-secret derivation functions; `getAccountIdByEmail` unchanged.                                                                                                                                                                          |
| `src/domain/confirmation-secrets.ts`                                   | Add the random-secret generator (candidate new home per open question 3).                                                                                                                                                                                          |
| `src/api/authentication.ts`                                            | `checkCredentials` becomes async; calls `verifyPassword`; adds lazy rehash-and-store on legacy-format success, skipped for demo sessions.                                                                                                                          |
| `src/api/account.ts`                                                   | Change-password and delete-account-confirm switch to `verifyPassword`/`hashPassword`.                                                                                                                                                                              |
| `src/api/password-reset.ts`                                            | Switch to `hashPassword`; switch secret derivation to the random generator.                                                                                                                                                                                        |
| `src/api/registration.ts`                                              | Switch to `hashPassword`; refactor to generate the confirmation secret once and thread it through, instead of deriving it twice.                                                                                                                                   |
| `src/shared/test-utils.ts`, `src/domain/account-storage.spec.ts`       | Update `'x'.repeat(...)` fixtures to valid hex.                                                                                                                                                                                                                    |
| New: `src/shared/crypto.spec.ts`, `src/domain/hashed-password.spec.ts` | New test coverage per the plan above.                                                                                                                                                                                                                              |

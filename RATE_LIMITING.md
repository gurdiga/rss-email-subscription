# Rate limiting the unauthenticated endpoints

Handoff note for whoever picks this up. Everything here was verified against the tree at the time of writing; re-check anything that looks stale.

## Why

Password hashing moved from a single SHA-256 (microseconds) to scrypt at `N=32768, r=8, p=1`, benchmarked at **~135 ms per hash** on the production box. That was a deliberate, correct change — but it means every unauthenticated request that reaches a password path now costs real CPU, on a machine with **one vCPU**.

There is no rate limiting anywhere in the stack today. `helmet` is in use (`src/api/server.ts`), but it only sets security response headers — it has no request counting, no windowing, no store. It does not help here.

The exposure is not theoretical: an attacker who sends concurrent requests to `/api/authentication` in a loop makes the box do 135 ms of scrypt per request, with nothing throttling them. Node runs scrypt on the libuv threadpool (default size 4), so the event loop stays responsive and the box will not lock up — but the single core saturates and everything slows down. This is the last known open item from the security review of PR #3.

## Scope

Rate-limit these five, all unauthenticated and internet-reachable (paths from `src/domain/api-path.ts`, served under `/api`):

| Path | Cost per request | Notes |
| --- | --- | --- |
| `/authentication` | ~135 ms scrypt | Highest value target — also the credential-stuffing surface |
| `/registration` | ~135 ms scrypt | Also creates a Paddle transaction and sends an email |
| `/request-password-reset` | Email send | Cheap in CPU, but sends mail to a third party — abuse damages sending reputation |
| `/confirm-password-reset` | ~135 ms scrypt | |
| `/registration-confirmation` | Storage only | Lower priority; include for consistency |

`/deauthentication` and the authenticated endpoints are out of scope — a session is already required.

## The one thing that will break this if you get it wrong

**`req.ip` is not the client's IP in this deployment.** Read this before writing any code.

- The API runs behind nginx (`website/nginx/conf.d/website.conf`), on an internal Docker network. The api container publishes no host port, so nginx is the only path in.
- nginx sets **`X-Real-IP: $remote_addr`** (line 63). It does **not** set `X-Forwarded-For`.
- `src/api/server.ts` does **not** call `app.set('trust proxy', …)`.

So `req.ip` resolves to nginx's container address for *every* request. `express-rate-limit` keys on `req.ip` by default, which would put the entire internet into a single shared bucket: the first N requests globally would exhaust the limit and every subsequent user would get a 429. That is a self-inflicted outage, and it will not show up in local testing where there is no proxy.

Note that enabling `trust proxy` does **not** fix it either, because express reads `X-Forwarded-For`, which nginx here never sets.

Two workable options:

1. **Custom `keyGenerator` reading `x-real-ip`.** Smaller change, no nginx edit, no deploy coupling. `src/api/app-request-handler.ts` already reads `req.headers['x-real-ip']` for logging, so there is precedent in-repo. Fall back to `req.ip` when the header is absent so local/dev requests still key sensibly.
2. **Add `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` to nginx and set `trust proxy` to 1.** More conventional, but touches the web server config and needs the nginx change deployed in step with the API change.

Option 1 is recommended for a first pass.

Spoofing is not a concern under either option **provided the api stays unreachable except through nginx**: `proxy_set_header X-Real-IP $remote_addr` overwrites whatever the client sent. If the api container is ever given a published port, this assumption dies and the header becomes attacker-controlled.

## Suggested approach

`express-rate-limit` is the obvious choice — it is the standard, actively maintained, has no dependencies, and works as plain express middleware alongside the existing `router.use(...)` chain in `src/api/server.ts`.

The default in-memory store is **fine here**: there is exactly one `api` container (`docker-compose.yml` gives it a fixed `container_name` and a static IP, and there are no replicas), so a per-process counter is a global counter. If the deployment ever scales out, this becomes wrong silently — worth a comment at the call site saying so.

Rough shape:

```ts
// In server.ts, before the route handlers.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  keyGenerator: (req) => (req.headers['x-real-ip'] as string) || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  // Single api container, so an in-memory store is a global one. Revisit if this
  // ever runs more than one process.
});

router.use(ApiPath.authentication, authLimiter);
```

Numbers to start from, to be tuned rather than trusted:

- `/authentication`: **20 per 15 min per IP.** Generous for a human who forgot their password; ruinous for credential stuffing.
- `/registration`: **5 per hour per IP.** Legitimate users register once.
- `/request-password-reset`: **5 per hour per IP.** This one also throttles outbound mail, which protects sending reputation.
- The two confirmation endpoints: **20 per 15 min per IP.**

Consider a second, much wider global limiter as a backstop against a distributed source, where per-IP limits do nothing.

## Watch out for

- **Response shape.** The API has a typed envelope (`src/shared/api-response.ts`: `Success` / `InputError` / `AppError` / `NotAuthenticatedError`). `express-rate-limit`'s default 429 body is a bare string and will not match it. Web UI pages branch on `response.kind` and several call `exhaustivenessCheck(response)`, **which throws** — an unrecognised shape will break the page rather than display a message. Use the `handler` option to send something the client understands. Note there is no existing `kind` for "too many requests"; either add one and handle it in the pages, or return an `AppError` with a clear message as the low-risk option.
- **`api-test.spec.ts` will trip the limits.** It runs the full register → confirm → login → change → reset flow, repeatedly, from one IP. Either set the limits high enough not to bite, or disable the limiter when `NODE_ENV` is not production. Run `make api-test` (needs `make start-api` in another terminal) before declaring the work done — the unit suite will not catch this.
- **The demo account.** Shared by definition, so every demo visitor shares one IP bucket if they arrive via the same NAT. Check whether demo logins need an exemption.
- **Do not lower `N` to compensate.** The cost is deliberate and was benchmarked into the 100–250 ms target band. Rate limiting is the mitigation; a cheaper hash is a regression.

## Done when

- The five endpoints are limited, keyed on the real client IP (verified behind nginx, not just locally).
- Exceeding a limit returns a response the web UI renders as a message, with no thrown exhaustiveness check.
- `make test` and `make api-test` both pass.
- A comment at the call site records that the in-memory store assumes a single api process.

# sandradodd.com — Remaining Actions

Server side is done and deployed (postilion + smtp-in config, DKIM key generated on prod, both SASL logins live, cross-domain isolation verified, committed in `e86bc20`/`0fb8162`). What’s left is all off-box: Cloudflare DNS, Gmail send-as, and verification.

Two things make this domain trickier than gurdiga.com — do the steps in order:

- DMARC is already `p=reject; adkim=s; aspf=s` (strict). Do **not** send as @sandradodd.com through postilion until the DKIM TXT and SPF are live, or mail hard-bounces (not spam-folder).
- Mailgun is live (MX + `include:mailgun.org`) and stays for now (“test the waters”). Leave all existing Mailgun records — MX until the flip, plus its own DKIM selectors and tracking CNAMEs — untouched. The proxied A records (website) must not be touched either; every new mail record is grey-cloud (DNS-only).

Record values are in [dns/sandradodd.com.txt](dns/sandradodd.com.txt) (source of truth, DKIM key already filled in).

## Phase 1 — Additive DNS (Vlad, Cloudflare) — safe, nothing breaks

Mailgun inbound and sending keep working throughout this phase.

- [ ] Add grey-cloud `A  mx  → 207.154.253.211`
- [ ] Add `TXT  mail._domainkey` → the DKIM value from dns/sandradodd.com.txt
- [ ] Change SPF to `v=spf1 a:mx.sandradodd.com include:mailgun.org ~all` (adds the droplet, keeps Mailgun)
- [ ] Leave DMARC as is — already at the target strictness

## Phase 2 — Verify sending (Claude, from prod) — no MX change needed

Runs against the authenticated submission path, independent of inbound.

- [ ] `docker exec postilion opendkim-testkey -d sandradodd.com -s mail -k /etc/opendkim/keys/sandradodd.com.private -vvv`
- [ ] Authenticated send as `sandra@sandradodd.com` → external Gmail; confirm “Show original” shows SPF **pass**, DKIM **pass** (d=sandradodd.com, s=mail), DMARC **pass**

Ping me once Phase 1 has propagated (`dig +short txt mail._domainkey.sandradodd.com @<cloudflare-ns>`) and I’ll run these.

## Phase 3 — Flip inbound (Vlad, Cloudflare) — when ready to leave Mailgun for receiving

- [ ] Replace **both** `mxa/mxb.mailgun.org` MX records with grey-cloud `MX  @  10  mx.sandradodd.com`
- [ ] Verify inbound (Claude): external → `anything@sandradodd.com` lands in aelflaed@gmail.com (Return-Path `SRS0=…@feedsubscription.com` is expected, not a bug)

## Phase 4 — Gmail send-as (Sandra) — cleanest after the MX flip

Best done after Phase 3 so Gmail’s verification code auto-forwards to aelflaed@gmail.com. Before the flip it goes wherever Mailgun currently routes sandra@sandradodd.com, so Sandra would need access to that mailbox.

- [ ] Vlad: hand Sandra `POSTILION_SASL_PASSWORD_SANDRADODD_COM` (from prod `~/src/rss-email-subscription/.env`), securely
- [ ] Sandra, in her aelflaed@gmail.com account → “Send mail as” → add `sandra@sandradodd.com`:
  - SMTP server `feedsubscription.com` (matches the TLS cert — not sandradodd.com), port `587`, TLS
  - Username `sandra@sandradodd.com`, password as above
- [ ] Retrieve the verification code from the inbox and confirm
- [ ] mail-tester.com check from the new send-as identity

## Later / watch

- SPF cleanup: once Mailgun sending is fully retired, drop `include:mailgun.org` → `v=spf1 a:mx.sandradodd.com ~all`. Not before — any forgotten Mailgun sender would hard-bounce under `p=reject`.
- ~~Loop-back caveat (CODEX_REVIEW.md #2)~~: fixed — smtp-in now greets with a distinct `smtpd_banner`, so droplet-origin mail (app/ssmtp) to the hosted domains relays through smtp-in instead of bouncing.

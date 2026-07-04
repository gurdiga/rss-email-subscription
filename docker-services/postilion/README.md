# postilion

Authenticated mail submission + DKIM signing for personal domains (first: gurdiga.com). Named after the rider who carried the mail coach’s post. Design doc: [POSTILION.md](../../POSTILION.md).

Inbound mail for these domains is NOT handled here — it arrives at smtp-in on port 25 (the domains are listed in smtp-in’s `relay_domains` and `virtual`).

## Ports

- Host `587` → container `587`: public submission (STARTTLS required, SASL PLAIN/LOGIN after TLS only). The container’s port-25 listener is disabled in `entrypoint.sh`.

## Policy

- Only SASL-authenticated clients may relay: `smtpd_relay_restrictions = permit_sasl_authenticated, reject`.
- One login per domain, derived from `etc/postfix/sender_logins` (e.g. `gurdiga@gurdiga.com` for gurdiga.com). Each login’s password comes from its own required env var `POSTILION_SASL_PASSWORD_<DOMAIN>` (dots/dashes → underscores, uppercased: `POSTILION_SASL_PASSWORD_GURDIGA_COM`). `sender_logins` also restricts which MAIL FROM addresses each login may use (`reject_sender_login_mismatch`).
- Outgoing mail is DKIM-signed by OpenDKIM (selector `mail`, keys per domain in `etc/opendkim/KeyTable`).
- `etc/postfix/virtual` short-circuits mail addressed *to* the personal domains (e.g. Gmail’s send-as verification email) straight to gurdiga@gmail.com.

## Volumes

- `./.tmp/opendkim-keys:/mnt/opendkim-keys:ro` — private DKIM keys, one `<domain>.private` per domain in KeyTable. Generate with `make dkim-key DKIM_DOMAIN=<domain>`. The container fails to start if any is missing.
- Let’s Encrypt cert mounted as `/etc/postfix/cert/smtp.{cert,key}` (same files as smtp-in). Because these are bind-mounted files, renewal leaves the container holding stale inodes — hence the weekly `make restart-postilion` cron.
- `./.tmp/postilion-queue:/var/spool/postfix` — postfix queue persists across restarts.

## Mail client settings (Gmail “send mail as”)

- SMTP server: `feedsubscription.com` (matches the TLS cert; do NOT use the domain’s own name), port `587`, TLS.
- Username: the domain’s login from `sender_logins` (e.g. `gurdiga@gurdiga.com`); password: the domain’s `POSTILION_SASL_PASSWORD_<DOMAIN>` from prod `.env`.

## Droplet-origin mail to the hosted domains

Mail originated on the droplet itself (ssmtp/smtp-out) addressed to a personal domain used to bounce with “mail for &lt;domain&gt; loops back to myself”: smtp-out’s loop detection compares the EHLO reply hostname of the server it connects to against its own `myhostname`, and both containers used `feedsubscription.com`. Fixed by setting smtp-in’s `myhostname = mx.feedsubscription.com` (with `smtp_helo_name` pinned to `feedsubscription.com` so outbound HELO/SPF is unchanged) — droplet-origin mail now relays through smtp-in like any external mail. Don’t “simplify” smtp-in’s hostname back to feedsubscription.com.

## Adding a domain (config-only; no code changes)

1. `make dkim-key DKIM_DOMAIN=example.com` — on prod for the real key, locally for a throwaway. Publishable DNS record lands in `.tmp/opendkim-keys/example.com.txt`.
2. postilion config lines: `etc/postfix/main.cf.override` (append to `virtual_alias_domains`), `etc/postfix/virtual` (`@example.com gurdiga@gmail.com`), `etc/postfix/sender_logins` (`@example.com gurdiga@example.com` — its own login), `etc/opendkim/KeyTable` + `etc/opendkim/SigningTable` (selector `mail`).
3. New password: `POSTILION_SASL_PASSWORD_EXAMPLE_COM` in prod `.env` (+ `.env.sample`) and in the `postilion` service environment in `docker-compose.yml`.
4. smtp-in: append to `relay_domains` in `etc/postfix/main.cf.override` + add the `virtual` line.
5. New `dns/example.com.txt`; publish MX/SPF/DKIM/DMARC on the domain’s DNS (see `dns/gurdiga.com.txt` for the pattern).
6. Rebuild + restart postilion and smtp-in.

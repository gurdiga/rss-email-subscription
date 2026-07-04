# postilion

Authenticated mail submission + DKIM signing for personal domains (first: gurdiga.com). Named after the rider who carried the mail coach’s post. Design doc: [POSTILION.md](../../POSTILION.md).

Inbound mail for these domains is NOT handled here — it arrives at smtp-in on port 25 (the domains are listed in smtp-in’s `relay_domains` and `virtual`).

## Ports

- Host `587` → container `587`: public submission (STARTTLS required, SASL PLAIN/LOGIN after TLS only). The container’s port-25 listener is disabled in `entrypoint.sh`.

## Policy

- Only SASL-authenticated clients may relay: `smtpd_relay_restrictions = permit_sasl_authenticated, reject`.
- One login for all domains: `gurdiga@gurdiga.com` (password: `POSTILION_SASL_PASSWORD` env var, required). `etc/postfix/sender_logins` restricts which MAIL FROM addresses the login may use (`reject_sender_login_mismatch`).
- Outgoing mail is DKIM-signed by OpenDKIM (selector `mail`, keys per domain in `etc/opendkim/KeyTable`).
- `etc/postfix/virtual` short-circuits mail addressed *to* the personal domains (e.g. Gmail’s send-as verification email) straight to gurdiga@gmail.com.

## Volumes

- `./.tmp/opendkim-keys:/mnt/opendkim-keys:ro` — private DKIM keys, one `<domain>.private` per domain in KeyTable. Generate with `make dkim-key DKIM_DOMAIN=<domain>`. The container fails to start if any is missing.
- Let’s Encrypt cert mounted as `/etc/postfix/cert/smtp.{cert,key}` (same files as smtp-in). Because these are bind-mounted files, renewal leaves the container holding stale inodes — hence the weekly `make restart-postilion` cron.
- `./.tmp/postilion-queue:/var/spool/postfix` — postfix queue persists across restarts.

## Mail client settings (Gmail “send mail as”)

- SMTP server: `feedsubscription.com` (matches the TLS cert; do NOT use the domain’s own name), port `587`, TLS.
- Username: `gurdiga@gurdiga.com`; password: the prod `POSTILION_SASL_PASSWORD`.

## Adding a domain (config-only; no code changes)

1. `make dkim-key DKIM_DOMAIN=example.com` — on prod for the real key, locally for a throwaway. Publishable DNS record lands in `.tmp/opendkim-keys/example.com.txt`.
2. postilion config lines: `etc/postfix/main.cf.override` (append to `virtual_alias_domains`), `etc/postfix/virtual` (`@example.com gurdiga@gmail.com`), `etc/postfix/sender_logins` (`@example.com gurdiga@gurdiga.com`), `etc/opendkim/KeyTable` + `etc/opendkim/SigningTable` (selector `mail`).
3. smtp-in: append to `relay_domains` in `etc/postfix/main.cf.override` + add the `virtual` line.
4. New `dns/example.com.txt`; publish MX/SPF/DKIM/DMARC on the domain’s DNS (see `dns/gurdiga.com.txt` for the pattern).
5. Rebuild + restart postilion and smtp-in.

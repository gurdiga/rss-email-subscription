# postilion: Send + Receive Email for Personal Domains (first: gurdiga.com)

## Context

gurdiga.com (DNS on Cloudflare, website on GitHub Pages) should send and receive mail through the feedsubscription.com prod server (207.154.253.211) — with proper SPF, DKIM, and DMARC. Today inbound gurdiga.com mail goes through Cloudflare Email Routing → gurdiga@gmail.com, and outbound goes via Gmail.

Requirements:

- Mail clients must be able to send as @gurdiga.com — specifically Gmail’s “send mail as” — which needs a publicly reachable authenticated submission endpoint with a valid TLS cert.
- smtp-out must not be touched at all.
- The design must be domain-agnostic: more personal domains will be added later.
- Inbound: forward to gurdiga@gmail.com via smtp-in + SRS (chosen over local delivery + Gmail POP3 fetch — instant delivery, zero new services, identical to the battle-tested feedsubscription.com flow; the SRS Return-Path is cosmetic).

The new container is named **postilion** — the rider who carried the mail coach’s post.

## Design

A new dedicated container **postilion** handles everything outbound for personal domains: public submission on host port 587 (STARTTLS-required, SASL auth, sender-login enforcement) plus its own OpenDKIM signing and its own postfix queue. It merges two existing, proven patterns: smtp-in’s entrypoint (override-file config, SASL, TLS check, chroot copies) and smtp-out’s OpenDKIM setup. Nothing in it is gurdiga.com-specific except config-file lines; adding a domain is a documented checklist (below), never an entrypoint/code change.

- **smtp-out: zero changes.** Different container, different queue, different port; app/ssmtp/delmon flows untouched.
- **smtp-in: 2-line change per domain** — unavoidable, since it owns port 25 where all MX traffic for this IP lands: add the domain to `relay_domains` and `@domain → gurdiga@gmail.com` to `virtual`. postsrsd stays single-domain: the SRS rewrite domain only needs its SPF to authorize the forwarding IP and its MX to route bounces back to the same postsrsd — both already hold for feedsubscription.com, for any number of forwarded domains. postgrey is not wired into postfix (no `check_policy_service`), so no greylist delays.
- `myhostname=feedsubscription.com` in postilion (HELO matches PTR; LE cert matches). Mail clients connect to `feedsubscription.com:587` regardless of sender domain — the cert already covers that name, so no cert changes are ever needed for new domains.
- One SASL login **per domain**, derived from `sender_logins` (e.g. `gurdiga@gurdiga.com` for gurdiga.com), each with its own password in `POSTILION_SASL_PASSWORD_<DOMAIN>` (dots/dashes → underscores, uppercased) — a leaked credential exposes only one domain.
- Logging: automatic — the logger’s syslog-ng writes `$HOST/$PROGRAM.log` per container tag, so `.tmp/logs/feedsubscription/postilion.log` appears with no logger changes.

## New service: docker-services/postilion/

- **Dockerfile** — `debian:bookworm-slim`, pinned packages (same versions as smtp-in/smtp-out): `postfix`, `opendkim`, `opendkim-tools` (provides `opendkim-genkey`), `sasl2-bin`, `libsasl2-modules`, `ca-certificates`, `bind9-dnsutils`. COPY config files + entrypoint. Use `texthash:` maps throughout — no postmap/BerkeleyDB (sidesteps smtp-out’s TODO about deprecated postmap DB).
- **etc/postfix/main.cf.override** (smtp-in’s pattern, applied line-by-line via `postconf -e`):

  ```
  myhostname = feedsubscription.com
  mydestination = localhost
  inet_protocols = ipv4
  smtp_address_preference = ipv4
  maillog_file = /dev/stdout
  mynetworks = 127.0.0.0/8
  message_size_limit = 26214400
  virtual_alias_domains = gurdiga.com
  virtual_alias_maps = texthash:/etc/postfix/virtual
  smtp_tls_security_level = may
  smtpd_tls_security_level = encrypt
  smtpd_tls_auth_only = yes
  smtpd_sasl_auth_enable = yes
  smtpd_sender_login_maps = texthash:/etc/postfix/sender_logins
  smtpd_sender_restrictions = reject_sender_login_mismatch
  smtpd_relay_restrictions = permit_sasl_authenticated, reject
  smtpd_recipient_restrictions = permit_sasl_authenticated, reject
  smtpd_helo_required = yes
  smtpd_client_connection_rate_limit = 10
  ```

  Global (not per-listener `-o`) settings are fine because this container serves only submission.
- **etc/postfix/virtual** — `@gurdiga.com gurdiga@gmail.com` (so Gmail’s send-as verification email to gurdiga@gurdiga.com short-circuits to Gmail without a loop through the public MX).
- **etc/postfix/sender_logins** — `@gurdiga.com gurdiga@gurdiga.com` (the authenticated user may send as any @gurdiga.com address, nothing else; future domains add a line mapping to their own login).
- **etc/sasl2/smtpd.conf** — `auxprop_plugin: sasldb` / `mech_list: PLAIN LOGIN` (only offered after STARTTLS).
- **etc/opendkim/** — `opendkim.conf` (copy of smtp-out’s: Mode s, Selector mail, socket inet:8891@127.0.0.1, OversignHeaders From), `KeyTable` (`mail._domainkey.gurdiga.com gurdiga.com:mail:/etc/opendkim/keys/gurdiga.com.private`), `SigningTable` (`gurdiga.com mail._domainkey.gurdiga.com`), `TrustedHosts` (`127.0.0.1`, `localhost`). SASL-authenticated senders are signed by OpenDKIM by default (postfix passes `{auth_type}` milter macros) — verified in rollout step 5.
- **entrypoint.sh** — merge of the two existing entrypoints, fully domain-agnostic:
  - apply overrides loop (smtp-in entrypoint.sh:9-18)
  - chroot copies incl. sasldb (smtp-in:82-85, 28-30 — Debian’s default chrooted master.cf is used here, unlike smtp-out’s custom one)
  - `configure_sasl()` (smtp-in:20-39, generalized): derive the login list from `sender_logins` (right-hand column, unique); for each `user@domain` require `POSTILION_SASL_PASSWORD_<DOMAIN>` and run `saslpasswd2 -p -c -u domain user`
  - `configure_tls()` (smtp-in:41-52): fail if `/etc/postfix/cert/smtp.cert|key` missing; set `smtpd_tls_cert_file`/`key_file`
  - `configure_opendkim()` (smtp-out:27-50, generalized): derive the key list from KeyTable — for each non-comment line, extract the key path (3rd colon-field of column 2), copy the matching `<domain>.private` from `/mnt/opendkim-keys`, chown/chmod, fail if missing. Adding a domain never touches this script.
  - enable the submission listener and drop the unused port-25 one: `postconf -M submission/inet='submission inet n - y - - smtpd'` and `postconf -M# smtp/inet`
  - `exec postfix start-fg`
- **README.md** — ports, env var, sender-login policy, weekly restart requirement, Gmail send-as settings, and the “Adding a domain” checklist (below).

## Other repo changes

- **docker-compose.yml** — new `postilion` service: image/container/hostname `postilion`, static IP `10.5.5.10` (free), `ports: ['587:587']`, `restart: always`, depends_on logger+resolver, `<<: [*logging, *x-disable-ipv6, *x-dns]`, volumes:
  - `./.tmp/opendkim-keys:/mnt/opendkim-keys:ro` (same host dir smtp-out uses; new key files, no conflict)
  - the two certbot mounts exactly as smtp-in has (docker-compose.yml:66-67)
  - `./.tmp/postilion-queue:/var/spool/postfix` (own persistent queue)
  - environment: `TZ: UTC`, `POSTILION_SASL_PASSWORD_GURDIGA_COM: ${POSTILION_SASL_PASSWORD_GURDIGA_COM?}` (one per domain)
- **smtp-in** (only touched files):
  - `docker-services/smtp-in/etc/postfix/main.cf.override:11` → `relay_domains = feedsubscription.com, gurdiga.com`
  - `docker-services/smtp-in/etc/postfix/virtual` → add `@gurdiga.com gurdiga@gmail.com` (Dockerfile already postmaps at build)
- **.env.sample** — add `POSTILION_SASL_PASSWORD_GURDIGA_COM=` next to `SMTP_IN_SASL_PASSWORD`
- **Makefile**:
  - new `postilion` build target (mirror `smtp-out`, Makefile:241)
  - new `dkim-key` target: `docker run --rm --entrypoint sh -v $(PWD)/.tmp/opendkim-keys:/keys postilion -c 'opendkim-genkey -b 2048 -d $(DKIM_DOMAIN) -s mail -D /keys && mv /keys/mail.private /keys/$(DKIM_DOMAIN).private && mv /keys/mail.txt /keys/$(DKIM_DOMAIN).txt'` with a `DKIM_DOMAIN` guard (runs in the postilion image — smtp-out untouched)
  - new `restart-postilion` target mirroring `restart-smtp-in` (Makefile:345), `# cron @weekly` — cert bind-mounts go stale after renewal
  - `ufw-config` (Makefile:1076): add `ufw allow 587/tcp`
  - `all-images` (Makefile:~1131): add `postilion`
- **New `dns/gurdiga.com.txt`** — reference doc: Cloudflare-hosted, applied manually in the dashboard, NOT managed by `dns/update.sh`; A/AAAA (GitHub Pages) records must not be touched.

## Adding a domain later (README checklist; no code changes)

1. `make dkim-key DKIM_DOMAIN=example.com` (on prod for the real key; locally for a throwaway).
2. postilion config lines: `main.cf.override` (`virtual_alias_domains` list), `virtual` (`@example.com gurdiga@gmail.com`), `sender_logins` (`@example.com gurdiga@example.com` — its own login), `KeyTable` + `SigningTable` (selector `mail`).
3. New password: `POSTILION_SASL_PASSWORD_EXAMPLE_COM` in prod `.env` (+ `.env.sample`) and in the postilion service environment in `docker-compose.yml`.
4. smtp-in: `relay_domains` list + `virtual` line.
5. New `dns/example.com.txt`; publish MX/SPF/DKIM/DMARC on the domain’s DNS.
6. Rebuild + restart postilion and smtp-in.

## DNS changes for gurdiga.com (Cloudflare dashboard, all grey-cloud/DNS-only)

```
A     mx              207.154.253.211
MX    @               10  mx.gurdiga.com
TXT   @               v=spf1 a:mx.gurdiga.com include:_spf.google.com ~all
TXT   mail._domainkey v=DKIM1; ... p=<from prod .tmp/opendkim-keys/gurdiga.com.txt>
TXT   _dmarc          v=DMARC1; p=none; rua=mailto:dmarc-reports@gurdiga.com; ri=604800
```

- The droplet is designated as gurdiga.com’s formal MX via `mx.gurdiga.com` (grey-cloud A record — a proxied record would resolve to Cloudflare edge IPs and break both SMTP and SPF), and SPF authorizes it by name via `a:mx.gurdiga.com`, making the A record the single in-zone source of truth for the IP. Note the scope of these records: the MX makes receiving work, and the SPF entry makes postilion-originated mail (sending as @gurdiga.com) pass SPF. Mail *forwarded onward* to Gmail is a separate transmission whose SPF is evaluated against the original sender’s domain — which is why smtp-in’s SRS rewriting remains necessary regardless of these records.
- `a:mx.gurdiga.com` rather than plain `mx`: the `mx` mechanism authorizes whatever MX currently points to, which during the transition is still Cloudflare — pre-flip submission tests would fail SPF. The `A mx` record is additive and published early (rollout step 4), so `a:mx.gurdiga.com` is correct throughout. After cutover the two are equivalent; simplify to `mx` if desired.
- Gmail send-as still uses `feedsubscription.com` as the SMTP server name, because that’s the name the LE cert covers. The `mx.gurdiga.com` cert mismatch on port 25 is harmless (inbound TLS is opportunistic); it would only matter under MTA-STS/DANE, which gurdiga.com doesn’t publish.
- If the droplet IP ever changes, update feedsubscription.com’s A records and this zone’s `A mx` record; SPF follows the latter automatically.
- Keep `include:_spf.google.com` and `~all` during transition; Cloudflare Email Routing must be disabled before editing MX (it owns those records).
- Follow-up after 2–4 weeks of clean DMARC reports: tighten to `-all` and `p=quarantine/reject` (feedsubscription.com’s `p=reject; adkim=s; aspf=s` is the model).

## Rollout sequence

1. Implement repo changes; build locally (`make postilion smtp-in`); generate throwaway local key `make dkim-key DKIM_DOMAIN=gurdiga.com`; add `POSTILION_SASL_PASSWORD` to local `.env`; commit + push.
2. Prod (via prod-deploy skill / SSH ControlMaster): add strong `POSTILION_SASL_PASSWORD` to prod `.env`; `git pull && make smtp-in postilion && make dkim-key DKIM_DOMAIN=gurdiga.com && make start`. Key + env must exist before start (entrypoint hard-fails otherwise).
3. Verify existing flows unbroken (Verification A) — expected blast radius is only the smtp-in restart (seconds; senders retry).
4. Publish `A mx` + DKIM TXT + SPF + DMARC on Cloudflare (all additive, safe while Email Routing still active). Verify: `docker exec postilion opendkim-testkey -d gurdiga.com -s mail -k /etc/opendkim/keys/gurdiga.com.private -vvv`.
5. Test submission end-to-end (doesn’t depend on MX): swaks auth send → Gmail “Show original” shows SPF/DKIM/DMARC pass for gurdiga.com.
6. Flip inbound: disable Cloudflare Email Routing, add the MX record, drop `include:_spf.mx.cloudflare.net` from SPF.
7. Test inbound: external mail → anything@gurdiga.com → arrives at gurdiga@gmail.com (Return-Path `SRS0=…@feedsubscription.com` is correct, not a bug).
8. Configure Gmail send-as: SMTP server `feedsubscription.com`, port 587, user `gurdiga@gurdiga.com`, password from prod `.env`, TLS. Verification email flows through the new listener → virtual alias → gurdiga@gmail.com.
9. mail-tester.com check from Gmail send-as; watch `.tmp/logs/feedsubscription/postilion.log`.
10. Add `restart-postilion` to prod crontab `@weekly` (next to restart-smtp-in); monitor DMARC reports; tighten SPF/DMARC later.

## Verification

- **A. Nothing broke**: `docker exec smtp-in postconf -n | grep relay_domains`; app sending still shows `status=sent` in `.tmp/logs/feedsubscription/smtp-out.log`; `echo -e "Subject: test\n\ntest" | ssmtp gurdiga@gmail.com` on droplet; inbound feedsubscription.com mail still forwards; delmon heartbeat OK. smtp-out container untouched — not even restarted.
- **B. Submission**: `openssl s_client -connect feedsubscription.com:587 -starttls smtp` shows LE cert; `swaks --server feedsubscription.com:587 --tls --auth PLAIN --auth-user gurdiga@gurdiga.com --from gurdiga@gurdiga.com --to <gmail>` → 250. Negative tests: unauthenticated relay → 554; wrong password → 535; `--from someone@example.org` → sender login mismatch; AUTH not offered before STARTTLS. Gmail “Show original”: SPF pass, DKIM pass (d=gurdiga.com, s=mail), DMARC pass. External `nc -vz feedsubscription.com 587` (also checks no DO cloud firewall blocks it).
- **C. Inbound**: external → random@gurdiga.com → in gurdiga@gmail.com.
- **D. DNS**: `dig +short mx gurdiga.com`, `txt gurdiga.com`, `txt mail._domainkey.gurdiga.com`, `txt _dmarc.gurdiga.com`.

## Risks / gotchas

- **smtp-out is untouched by design** — the only shared surface is the read-only `./.tmp/opendkim-keys` mount (new key files added, existing file untouched) and host port 587 (previously unused publicly; smtp-out’s is `127.0.0.1:1587`).
- **smtp-in restart** on deploy: brief inbound gap (seconds); SMTP senders retry — same as the existing weekly restart-smtp-in cron.
- **Public 587 attracts bots**: failed AUTHs will log warnings to postilion.log. No watcher emails exist for this log (watch-smtp-out only tails smtp-out.log), so no alert noise; optionally add a `watch-postilion` later if visibility is wanted. Anvil rate limit caps abuse.
- **Cert staleness**: without the weekly `restart-postilion` cron, mail-client sends eventually fail on an expired cert (bind-mounted files point at pre-renewal inodes).
- **Entrypoint hard-fails**: container won’t start without every DKIM key listed in KeyTable, cert mounts, and `POSTILION_SASL_PASSWORD` — step 2 ordering matters; also affects fresh local checkouts (documented in README).
- **OpenDKIM signing of authenticated mail**: default behavior signs SASL-authenticated senders; verified in rollout step 5. If it didn’t sign, the fix is opendkim config, not TrustedHosts IP lists.
- **Cloudflare**: every new record grey-cloud; don’t touch A/AAAA (GitHub Pages); Email Routing disabled before MX edits.

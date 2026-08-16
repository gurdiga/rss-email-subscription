# smtp-out

Debian-based Postfix + OpenDKIM container for outbound email delivery.

## Ports

| Scope | Port | Notes |
|-------|------|-------|
| Container-internal | 587 | Postfix submission port |
| Host-exposed | 1587 | `127.0.0.1:1587->587/tcp` |

## Dependencies on host configuration

### `/etc/ssmtp/ssmtp.conf`

Alerts now go out through `bin/notify`, which uses msmtp and Gmail directly, so that a mail outage cannot silence the alert about itself. `ssmtp` is left with exactly one caller — `watch-msmtp`, which reports failures of that channel and therefore must not use it — and relays through smtp-out:

```
mailhub=localhost:1587
```

If this port ever changes, update both `docker-compose.yml` and this file.

### `.env`

The app connects to smtp-out via the Docker internal network:

```
SMTP_CONNECTION_STRING=smtp://smtp-out:587
```

## Persistent data

- **Queue**: `.tmp/postfix-queue/` — mounted as `/var/spool/postfix` to survive container restarts
- **DKIM keys**: `.tmp/opendkim-keys/` — mounted read-only at `/mnt/opendkim-keys`

## Rebuilding

A rebuild re-runs `apt-get upgrade`, so it moves every unpinned package, not only the one whose pin you edited. Four things bound what it can disturb: `postfix` and `opendkim` are version-pinned and stay put; no configuration is baked from outside the image; the DKIM keys are bind-mounted read-only, so signing keys cannot be touched; and the queue is a bind mount, so replacing the container never drops queued mail. What genuinely changes is the TLS libraries.

Do it just after the daily send completes, for the longest observation window before the next one, and with the queue empty (`docker exec smtp-out postqueue -p`).

1. **Tag the current image first** — `docker tag smtp-out:latest smtp-out:rollback-$(date -u +%F)`. This is the entire safety net.
2. `make smtp-out start`.
3. Verify, in order: `postconf -n` diffs clean against the same output captured before the swap; `docker logs smtp-out --since 5m` shows no opendkim errors; the canary below signs; `postqueue -p` is empty.
4. Watch the next scheduled send end to end — `"sent":N,"failed":0` in the sending report, then `status=sent` and `removed` per message. Anything `deferred` or `bounced` above baseline is the signal to roll back.

**Rollback:** `docker tag smtp-out:rollback-YYYY-MM-DD smtp-out:latest && make start`. Seconds, no rebuild, queue intact.

### The DKIM canary

Worth proving on every rebuild, because a signing failure degrades deliverability instead of erroring: `milter_default_action` is `tempfail`, so an unreachable milter is loud, but a milter that signs with the wrong key is not. Read the signature off the queue file rather than inferring it from the far end:

```bash
swaks --server 127.0.0.1:1587 --from system@feedsubscription.com --to <you> --h-Subject "DKIM canary"
docker exec smtp-out postsuper -h <QID>   # grab QID from "250 Ok: queued as <QID>"
docker exec smtp-out postcat -q <QID>     # expect DKIM-Signature: … d=feedsubscription.com; s=mail
docker exec smtp-out postsuper -H <QID>   # release, or -d to drop it
```

Submitting on 1587 arrives as `client_name=app`, so it goes through `smtpd_milters` — the app's real path. `docker exec smtp-out sendmail` would exercise `non_smtpd_milters` instead. Releasing from hold logs a benign `qmgr_active_done_3_generic … No such file or directory` warning that `make watch-smtp-out` alerts on.

The key itself can be checked without sending anything, against the published record:

```bash
openssl rsa -in .tmp/opendkim-keys/feedsubscription.com.private -pubout
dig +short TXT mail._domainkey.feedsubscription.com
```

## What a CVE in this image can reach

Observed 2026-08-09; re-check the linkage if the package set changes.

Nothing can connect to smtp-out from the internet — it publishes `127.0.0.1:1587` only. But it initiates TLS to arbitrary MX servers, so a hostile receiving MX is an external attacker against whatever handles that connection. That is OpenSSL and glibc, not GnuTLS:

```
postfix smtp   → libssl.so.3, libcrypto.so.3      (OpenSSL)
postfix tlsmgr → libssl.so.3, libcrypto.so.3      (OpenSSL)
libgnutls30    ← pulled in by libldap-2.5-0 and apt
opendkim       → libssl.so.3 AND libgnutls.so.30  (via libunbound)
```

GnuTLS is present but reachable only through LDAP lookups, which are not configured, or through libunbound's TLS, which opendkim never uses because it runs `Mode s` (sign-only) and resolves nothing. By the same reasoning the perl and unbound CVEs that have no upstream fix are not a concern: no perl process runs in the container, and no unbound daemon runs anywhere.

## Delivery monitoring

`delmon` tails the log file named by its `SMTP_OUT_LOG` env var (set in `docker-compose.yml`) to track per-message delivery status. The filename is determined by syslog-ng based on the container name, so if this container is ever renamed, update `SMTP_OUT_LOG` in `docker-compose.yml` accordingly.

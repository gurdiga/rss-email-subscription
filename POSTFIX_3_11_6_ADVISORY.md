# Postfix 3.11.6 advisory — exposure triage

Triaged 2026-08-11 against the [postfix-announce mail of 2026-08-10](https://www.postfix.org/announcements/postfix-3.11.6.html), which shipped stable 3.11.6 plus legacy releases 3.10.13, 3.9.14, 3.8.20, 3.7.22, 3.6.20, 3.5.27 — 16 fixes, found by Qualys and OpenAI Security, more than half dating back 20+ years.

Both mitigations below were applied to smtp-in on 2026-08-15 and verified against the built image. postilion and smtp-out are unchanged.

## Where we stand

Three containers run Postfix, all pinned to the same Debian package:

| Container | Version | Exposure |
|---|---|---|
| [smtp-in](docker-services/smtp-in/Dockerfile) | `postfix=3.7.11-0+deb12u1` | `25:25` — the MX, open to the internet |
| [postilion](docker-services/postilion/Dockerfile) | `postfix=3.7.11-0+deb12u1` | `587:587` — internet, but STARTTLS + SASL required |
| [smtp-out](docker-services/smtp-out/Dockerfile) | `postfix=3.7.11-0+deb12u1` | `127.0.0.1:1587` + the compose net — no internet path |

Confirmed live on prod (`docker exec <c> postconf mail_version` → `3.7.11` on all three).

**There is nothing to bump today.** Debian bookworm is still at `3.7.11-0+deb12u1`; upstream 3.7 is out of support, so 3.7.22 will not arrive through apt unless the Debian maintainer imports it.

Two things make waiting a weak plan, both rechecked 2026-08-15:

- **The trixie move is not a fix today.** Trixie is at `3.10.11-0+deb13u1` and the fixes below shipped in 3.10.13, so moving the base image now lands on an unpatched 3.10. Trixie is stable and will get the update; bookworm is oldstable heading into LTS, so the ordering still favors trixie — but the `TODO(debian-upgrade)` in the smtp-out and smtp-in Dockerfiles is not a substitute for the config change.
- **The fixes carry no CVEs.** Neither the announcement nor [the Debian security tracker](https://security-tracker.debian.org/tracker/source-package/postfix) assigns identifiers to any of the 16. Debian tracks by CVE, so watching the tracker will most likely never surface them — bookworm’s only open postfix CVE is the unrelated CVE-2026-43964. Sid carries `3.11.6-1`.

## What applies: the two BDAT bugs

Announcement items #3 (`smtpd` command-history memory exhaustion from many very small BDAT requests) and #5 (missing RCPT TO state reset after a BDAT error → `DATA` without `MAIL FROM` → null-pointer read). Both were introduced in Postfix 3.4 and both need CHUNKING.

All three listeners advertise it. EHLO probe from inside each container:

```
250-SMTPUTF8
250 CHUNKING
```

smtp-in is the MX and accepts RCPT for `feedsubscription.com`, `gurdiga.com`, and `sandradodd.com`, so any stranger can get past RCPT and then send BDAT. Postgrey defers first-contact triplets, which costs a prober one 300s retry — it is not a barrier to a persistent attacker.

Severity is modest. Both bugs kill or bloat a single `smtpd` child that `master` respawns. The memory-exhaustion one is the only item with reach beyond the connection: the containers run without memory limits, so an unbounded command history pressures the droplet itself. That is the reason to act on this rather than wait for Debian.

postilion requires valid SASL credentials before RCPT succeeds (`smtpd_relay_restrictions = permit_sasl_authenticated, reject`), so it is credentialed-attacker-only. smtp-out is not internet-reachable at all.

## What does not apply

Checked against each item’s own preconditions, using `postconf -n` and `master.cf` on prod:

| Announcement item | Why it misses us |
|---|---|
| #1 SMTP state desync policy bypass | Conditioned on `smtpd_end_of_data_restrictions`; none of the three set it |
| #2 Milter policy bypass | Same precondition, plus a Milter — we have opendkim, but not the restrictions |
| #4 Address verification cache poisoning | Address verification not enabled; no untrusted local users in a container |
| #6 Dovecot AUTH null-pointer crash | `smtpd_sasl_type = cyrus` everywhere |
| #7, #9, #10 postscreen read-after-free / uninitialized reads | postscreen not enabled — `master.cf` wires `smtp inet` straight to `smtpd` |
| #11 DNS client MX/SRV over-read | Applies to smtp-out’s outbound lookups; ≤6 bytes, no crash claimed |
| #12, #13, #16 postsuper / record.c / postdrop | Local-user attacks; no untrusted local users |
| #14 non-transitive IPv4 comparison | Hygiene |
| #15 ETRN duplicate suppression | Hygiene; costs unnecessary queue scans, not security |

#1 and #2 are stated as the announcement states them. The root cause is a missing state reset after an end-of-data rejection and the text enumerates the known trigger, so this is “no known trigger in our config,” not proven immunity.

## Mitigation: CHUNKING disabled on smtp-in

Disable CHUNKING. This is a real disable, not a hidden EHLO keyword — from `bdat_cmd()` in the Postfix 3.7 source, the command is refused and the connection dropped before any chunk is read:

```c
if (state->ehlo_discard_mask & EHLO_MASK_CHUNKING) {
    state->error_mask |= MAIL_ERROR_PROTOCOL;
    smtpd_chat_reply(state, "521 5.5.1 Error: command not implemented");
    return (-1);
}
```

One line into [smtp-in/etc/postfix/main.cf.override](docker-services/smtp-in/etc/postfix/main.cf.override), which the entrypoint reads line by line through `postconf -e`:

```
smtpd_discard_ehlo_keywords = chunking
```

Senders that would have used BDAT — mostly Exchange and O365 — fall back to DATA. Plain `chunking` logs the discard; `chunking, silent-discard` would suppress that, and the log line is worth keeping.

Verified against the built image by talking SMTP to it: the EHLO reply no longer carries `CHUNKING`, `BDAT 4` draws `521 5.5.1 Error: command not implemented`, and the session logs

```
postfix/smtpd: discarding EHLO keywords: CHUNKING
postfix/smtpd: disconnect from ... ehlo=1 bdat=0/1 commands=1/2
```

**postilion is left alone.** The earlier draft of this document suggested it for defense in depth, but it needs valid credentials before RCPT, so on its own it does not justify the change — and BDAT_README names submission services as the ones you would normally *keep* CHUNKING on for client compatibility, which is exactly what postilion is: the MUA submission path for two personal domains. Adding the line there is one commit away if that ever changes.

smtp-out is excluded because it has no internet path to protect. (The standing do-not-touch policy on it was lifted 2026-08-14; it is not the reason.)

Deploy is a rebuild, not a restart: the Dockerfile `COPY`s the override file into the image, so a `docker restart` picks up nothing. On prod:

```bash
git pull && make smtp-in start
```

## Mitigation: bare-newline normalization on smtp-in

Raised because the announcement says so explicitly: the 3.5–3.7 legacy releases do **not** include the patches issued for “large SMTP inputs (June 2026)”, “TLSA parsing (June 2026)”, and the SMTP smuggling fixes, which “still need to be applied.”

smtp-in ran with the default `smtpd_forbid_bare_newline = no`, so bare-LF end-of-data detection was off on the internet-facing MX for three domains.

The fix is compiled into this build. Two vintages of it exist and they mean opposite things: in the original 3.7-era implementation `yes` rejected the connection outright, while 3.9 introduced `normalize` and remapped `yes` to it as a migration aid. Ours is the later one — the `normalize` string is in the `smtpd` binary, alongside the enum-era `_reject_code` parameter that the boolean implementation did not have:

```
$ docker exec smtp-in postconf -d | grep forbid_bare
smtpd_forbid_bare_newline = no
smtpd_forbid_bare_newline_exclusions = $mynetworks
smtpd_forbid_bare_newline_reject_code = 550
```

So `smtpd_forbid_bare_newline = normalize` requires `CRLF.CRLF` for end-of-data without rejecting bare-LF senders — which is why `normalize` and not `yes`: on an MX taking mail from strangers, rejecting is the change that costs real delivery.

Verified by A/B against the built image, sending one DATA body that contains a bare-LF `.` line followed by a complete second transaction:

| `smtpd_forbid_bare_newline` | Result |
|---|---|
| `no` | `ehlo=1 mail=2 rcpt=2 data=2` — the smuggled sender is queued as its own message |
| `normalize` | `ehlo=1 mail=1 rcpt=1 data=1` — the smuggled transaction stays body text |

**The exclusions default matters more than it looks.** `smtpd_forbid_bare_newline_exclusions = $mynetworks` exempts clients inside `mynetworks`, and the first run of that A/B showed no difference at all because the probe dialed from `127.0.0.1`. On prod this is not a hole: compatibility level ≥ 2 puts `mynetworks_style` at `host`, so prod’s `mynetworks` is loopback only —

```
mynetworks = 127.0.0.0/8 [::ffff:127.0.0.0]/104 [::1]/128
```

— which exempts nothing that arrives over the network, including sibling containers. Left at the default deliberately.

## Confirms an existing TODO

The announcement independently confirms both halves of the `TODO(debian-upgrade)` comment in [smtp-out/Dockerfile](docker-services/smtp-out/Dockerfile): BerkeleyDB is deprecated in Postfix 3.11+ (migrate `postmap` to LMDB or CDB), and 3.11+ adds TLS security level fields to delivery log lines, which the delmon regexes in [src/app/delivery-monitoring/line-processing.ts](src/app/delivery-monitoring/line-processing.ts) will need to absorb. smtp-in carries the BerkeleyDB half of the same TODO; postilion is already clear of it, since all its lookup tables are `texthash:`.

## Unrelated, surfaced in passing

CVE-2026-43964 — a one-byte over-read and possible crash from an enhanced status code lacking text after the third number — is open in bookworm, marked no-DSA (minor). Not part of 3.11.6, not addressed here.

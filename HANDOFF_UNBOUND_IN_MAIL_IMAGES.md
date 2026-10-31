# Handoff: clear unbound from smtp-out and postilion

Written 2026-10-31. Check everything below against the repo before relying on it; package facts age quickly.

## The problem

After the fixes of 2026-10-31, the only CRITICAL findings left on prod are in unbound: 2 CRITICAL (CVE-2026-81642, CVE-2026-33278) and 9 HIGH in both smtp-out and postilion. Docker Scout reports `Fixed version: not fixed` for all of them on Debian bookworm, unbound 1.17.1-2+deb12u4. smtp-in is not affected. Full results are in `docker-scan-2026-10-31.md`.

## What is known

- The findings come from one package, `libunbound8`. Nothing installs unbound as a server. `/var/lib/dpkg/status` shows `opendkim` depends on it in smtp-out, and `opendkim` and `opendkim-tools` in postilion. smtp-in has no opendkim and no unbound.
- So the exposure is a DNS resolver library inside OpenDKIM, not a listening DNS service. Establish what OpenDKIM actually does with it here (`docker-services/*/etc/opendkim/opendkim.conf`) and whether the CVEs are reachable that way. If they are not, documenting that may be the right outcome.
- Debian trixie candidates, checked 2026-10-31 on `debian:trixie-slim`: postfix 3.10.13-0+deb13u1, opendkim 2.11.0~beta2-9.1+b1, libunbound8 1.26.2-0+deb13u1, perl 5.40.1-6+deb13u1.
- Other bookworm findings with no fix at the time of writing, which a move might also clear: util-linux (6 HIGH), bind9 (6 HIGH), zlib, cyrus-sasl2, one perl HIGH.

## Options to weigh

1. Move smtp-out and postilion to trixie. This is the likely fix, and also the largest change: mail delivery depends on these two images.
2. Accept and document the risk, if the library's use here turns out not to reach the vulnerable code.
3. Wait for a Debian bookworm security update. Check the Debian security tracker for both CVEs first; it may show a status Scout does not.

Moving smtp-in as well is a separate question. It does not have this finding, and it is the internet-facing MX, so leaving it on bookworm keeps this change smaller. The cost is maintaining two Debian versions.

## If you move to trixie, check at least these

- Exact pins in the Dockerfiles: every version changes, and the `bind9-dnsutils`, `procps`, `net-tools` and `ca-certificates` lines all need new values.
- Postfix goes from 3.7 to 3.10, three major steps. Read the release notes. Check `compatibility_level`, and every setting in `etc/postfix/` and the entrypoints.
- `postmap` and BerkeleyDB: the TODO comments in the smtp-in and smtp-out Dockerfiles flag this for Postfix 3.11+. Trixie's postfix still depends on `libdb5.3t64`, so it may not bite yet. Postilion avoids it already by using `texthash:`.
- delmon parses smtp-out's log lines (`src/app/delivery-monitoring/line-processing.ts`). The smtp-out Dockerfile says Postfix 3.11+ adds TLS fields to delivery lines. Confirm 3.10's format still matches, using a real log line.
- smtp-out and postilion keep their queues on host volumes, `.tmp/postfix-queue` and `.tmp/postilion-queue`, written by Postfix 3.7. Drain them before the first start on 3.10, and check how the new version treats that directory.
- OpenDKIM moves too. DKIM must still pass at a real receiver, and that needs checking on prod. `POSTFIX_3_11_6_ADVISORY.md` holds earlier reasoning about Postfix versions and mitigations; read it first.

## How to work here safely

- Measure before deciding: build locally and scan the local image with `.claude/skills/docker-scan/scripts/scan-images.sh local`, or `docker scout cves <image>` for one image.
- A scan on prod peaks near 640 MB on a 957 MB droplet. Never scan during a build, and run nothing else heavy alongside it. See the docker-scan skill.
- Deploy one mail image at a time at a quiet moment, smtp-out last. `make <image>` only builds; `make start` activates. There is no old image to fall back to, so `docker save` the running one first. The weekly `docker-prune` removes unused images even when tagged.
- Local stacks send real email: use only `@feedsubscription.com` recipients.

## Done means

Either the unbound findings are gone from prod's smtp-out and postilion, with a real message delivered and DKIM passing, or there is a written reason, with evidence, for accepting them.

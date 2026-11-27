# Docker scan 2026-11-27

Scanned on prod twice on 2026-11-27: before the fixes below, and after they were deployed.

| Image | Critical | High | Medium | Low | Status |
|-------|---------:|-----:|-------:|----:|--------|
| website | 0 (was 6) | 1 (14) | 1 (16) | 1 (6) | musl fix not yet in Alpine 3.24 |
| logger | 0 (0) | 0 (4) | 2 (3) | 0 (0) | clean |
| smtp-in | 0 (0) | 21 (22) | 27 (28) | 58 (58) | no fix upstream |
| smtp-out | 1 (1) | 26 (27) | 54 (55) | 68 (68) | no fix upstream |
| postilion | 1 (1) | 26 (27) | 54 (55) | 68 (68) | no fix upstream |
| app | 0 (0) | 10 (10) | 13 (13) | 1 (1) | npm-internal only |
| certbot | 0 (0) | 11 (11) | 24 (24) | 3 (3) | build-only or unused |
| resolver | 0 (0) | 0 (0) | 44 (44) | 4 (4) | no HIGH or CRITICAL |

Numbers in parentheses are from the first scan. No HIGH or CRITICAL finding now has both a fix available and a role at runtime, except musl in website, whose fixed version Alpine 3.24 has not published yet.

## Fixed

| Image | Change | Commit |
|-------|--------|--------|
| website | Base image nginx 1.30.7-alpine3.24: nginx 1.30.7 (5C 1H), zlib 1.4-r0 (1C), plus libexpat, libssl3, libxslt and libxml2 fixes | 03369cce |
| logger | Rebuilt at `eafac2cd`, which already pinned openssl 3.5.9-r1 (4H); that commit was made on 2026-11-25 but logger had not been rebuilt since 2026-11-20 | eafac2cd |
| smtp-in, smtp-out, postilion | Rebuilt with `--no-cache`: pam 1.5.2-6+deb12u3 (1H each) | no Dockerfile change |

website's five nginx criticals: CVE-2026-123634, CVE-2026-123633, CVE-2026-123007, CVE-2026-121810, CVE-2026-113425. The zlib critical is CVE-2026-4738.

## ℹ️ No action

- app: `brace-expansion`, `pacote`, `picomatch`, `sigstore` and `ip-address` 10.1.0 are npm's own bundled modules. The app's own `ip-address` is 10.4.0.
- certbot: `sqlite` (no `.db` files in the image, now 6H), `binutils` (build tool), `wheel` (packaging tool), `jaraco-context` (vendored inside setuptools).

## ℹ️ No fix available

| Image | Package | Findings |
|-------|---------|----------|
| smtp-out, postilion | unbound 1.17.1-2+deb12u4 | 1C 5H (CVE-2026-81642) |
| smtp-in, smtp-out, postilion | krb5 1.20.1-2+deb12u5 | 6H, new since 2026-10-31 |
| smtp-in, smtp-out, postilion | bind9 1:9.18.49-1~deb12u3 | 6H |
| smtp-in, smtp-out, postilion | openssl 3.0.22-1~deb12u2 | 3H |
| smtp-in, smtp-out, postilion | util-linux 2.38.1-5+deb12u3 | 3H |
| smtp-in, smtp-out, postilion | zlib 1:1.2.13.dfsg-1 | 2H |
| smtp-in, smtp-out, postilion | glibc 2.36-9+deb12u14 | 1H |
| website | musl 1.2.6-r3 | 1H, fixed in 1.2.6-r6, not yet in Alpine 3.24 |

The unbound finding is `libunbound8`, a dependency of OpenDKIM; see `HANDOFF_UNBOUND_IN_MAIL_IMAGES.md`.

## Deploy

One image at a time: website, logger, smtp-in, postilion, smtp-out. A dry run before each `make start` confirmed only that image would be recreated.

- website: healthy, site, `/track` and the API return 200, HTTP redirects to HTTPS, and the repo's nginx config passes `nginx -t` on the new image.
- smtp-in: its entrypoint drained on stop. The two messages dropped were bounce notices to external domains, queued since 2026-11-25 and 2026-11-26.
- smtp-out: its 36 queued messages, Hotmail recipients of a 839-subscriber send at 07:02, survived the restart on the volume and kept delivering. The Hotmail delays are the known ATTR5 deferrals, not the deploy.
- No smoke test was sent: the only change on the mail path was pam.

The first scan took 15m42s, the rescan 8m36s; neither tripped the load and swap alert.

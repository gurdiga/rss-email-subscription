# Docker scan 2026-10-04

Scanned on prod twice: in the morning, before any fixes, and in the evening, after the fixes were deployed. The 2026-09-04 scan had no report file.

| Image | Critical | High | Medium | Low | Status |
|-------|---------:|-----:|-------:|----:|--------|
| app | 1 (was 1) | 13 (17) | 16 (24) | 1 (4) | npm-internal only |
| certbot | 0 (0) | 8 (10) | 17 (18) | 1 (1) | build-only or unused |
| logger | 0 (10) | 2 (22) | 6 (7) | 0 (0) | no fix upstream |
| smtp-in | 2 (3) | 19 (26) | 18 (29) | 47 (51) | no fix upstream |
| smtp-out | 4 (7) | 23 (32) | 34 (45) | 50 (52) | no fix upstream |
| postilion | 4 (7) | 23 (34) | 34 (47) | 50 (54) | no fix upstream |
| website | 0 (3) | 2 (11) | 14 (21) | 7 (12) | no fix upstream |
| resolver | 0 (0) | 0 (1) | 17 (52) | 3 (17) | clean |

Numbers in parentheses are the morning scan. After the evening scan, no HIGH or CRITICAL finding has both a fix available and a runtime role.

## Fixed today

| Image | Change | Commit |
|-------|--------|--------|
| website | openssl 3.3.7-r2 (3C 9H), libpng pin 1.6.59-r0 | 603671da |
| logger | openssl 3.5.9-r0; libcurl 8.22.0-r0 (10C 16H), util-linux and pcre2 picked up by the rebuild | 20b22997 |
| certbot | urllib3 2.8.0 (2H) | 06f7b4eb |
| app | openssl 3.5.9-r0; undici 7.30.0 (2H) | 9d1575c1, fa676de8 |
| app | nodemailer 10.0.14 (2H) | f610a2a5 (#15) |
| resolver | dnsutils pin .7; openssl 3.0.13-0ubuntu3.16 (1H) picked up by the rebuild | 6dd7e0cd |
| smtp-in, smtp-out, postilion | openssl 3.0.22-1~deb12u1, pcre2 10.42-1+deb12u2, libevent 2.1.12-stable-8+deb12u1, by a `--no-cache` rebuild | no Dockerfile change |

Three pins set on 2026-09-04 had already left their repositories and would have failed a fresh build: openssl 3.5.8-r0 on Alpine 3.23 (app, logger), libpng 1.6.57-r0 on Alpine 3.21 (website), and dnsutils 9.18.39-0ubuntu0.24.04.5 (resolver).

## ℹ️ No action

- app: `tar` 7.5.11 (1C 2H), `brace-expansion` (5H), `ip-address` 10.1.0, `picomatch`, `sigstore`, `pacote`, `http-cache-semantics`. All live only under `/usr/local/lib/node_modules/npm/`, so they are npm's own modules and not reachable at runtime. The app's own `ip-address` is 10.4.0.
- certbot: `wheel` (packaging tool), `binutils` (build tool), `sqlite` (no `.db` files in the image), `jaraco-context` (vendored inside setuptools).

## ℹ️ No fix available

| Image | Package | Findings |
|-------|---------|----------|
| logger | glib 2.86.3-r0 | 2H (CVE-2026-58016, CVE-2026-58014) |
| website | libxml2 2.13.9-r1 | 1H (CVE-2026-86140) |
| website | pcre2 10.43-r0 | 1H (CVE-2026-89161) |
| smtp-in, smtp-out, postilion | perl 5.36.0-7+deb12u3 | 2C 4H |
| smtp-in, smtp-out, postilion | bind9 1:9.18.49-1~deb12u2 | 7H |
| smtp-in, smtp-out, postilion | util-linux 2.38.1-5+deb12u3 | 4H |
| smtp-in, smtp-out, postilion | gcc-12 12.2.0-14+deb12u1 | 2H |
| smtp-in, smtp-out, postilion | openssl 3.0.22-1~deb12u1 | 1H (CVE-2026-84782) |
| smtp-in, smtp-out, postilion | zlib 1:1.2.13.dfsg-1 | 1H (CVE-2026-85091) |
| smtp-out, postilion | unbound 1.17.1-2+deb12u4 | 2C 4H |

## Scan incident

The first attempt at the evening scan ran four scans at once, exhausted swap on the 1 GB droplet, and took the site down until a reboot. The evening numbers above come from a second attempt that ran one image at a time, during which load stayed under 2. `scan-images.sh` now kills any prod scan after 300 seconds (440504e3); it still runs four at a time.

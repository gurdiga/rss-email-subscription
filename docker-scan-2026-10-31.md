# Docker scan 2026-10-31

Scanned on prod on 2026-10-30, then again on 2026-10-31 after the fixes below were deployed.

| Image | Critical | High | Medium | Low | Status |
|-------|---------:|-----:|-------:|----:|--------|
| app | 0 (was 1) | 10 (15) | 19 (24) | 1 (1) | npm-internal only |
| certbot | 0 (1) | 7 (7) | 18 (18) | 2 (2) | build-only, unused or vendored |
| logger | 0 (3) | 2 (9) | 7 (7) | 0 (0) | no fix upstream |
| smtp-in | 0 (5) | 15 (26) | 9 (20) | 52 (54) | no fix upstream |
| smtp-out | 2 (7) | 24 (35) | 41 (52) | 62 (64) | no fix upstream |
| postilion | 2 (7) | 24 (35) | 41 (52) | 62 (64) | no fix upstream |
| website | 0 (0) | 1 (1) | 5 (5) | 5 (5) | no fix upstream |
| resolver | 0 (0) | 0 (0) | 26 (48) | 3 (3) | no HIGH or CRITICAL |

Numbers in parentheses are from 2026-10-30. No HIGH or CRITICAL finding now has both a fix available and a role at runtime.

## Fixed

| Image | Change | Commit |
|-------|--------|--------|
| app | proxy-addr 2.0.8 (1C), body-parser 2.4.0 (1H), undici 7.30.1 (4H) | 6226c84c |
| certbot | certifi 2026.10.23 (1C) | e1cb6433 |
| logger | c-ares pin 1.34.9-r0; libcurl 8.23.0-r0 (2C 6H), brotli-libs 1.2.1-r0 (1C), zlib 1.3.2-r1 (1H) by the rebuild | ee15eac8 |
| resolver | dnsutils pin .8, dnsmasq 2.91-0ubuntu0.24.04.2 | d08d7706 |
| smtp-in | bind9-dnsutils deb12u3, ca-certificates 20250419~deb12u2, sasl +deb12u1; perl deb12u4 (5C 5H), openssl deb12u2 (1H), bind9 (5H) by the rebuild | 4c5262b6 |
| smtp-out | same, without the sasl pins | c9efd87d |
| postilion | same as smtp-in | 9ad094f5 |

`proxy-addr` was the one directly reachable finding: an authentication bypass in the library behind `trust proxy`, which per-IP rate limiting depends on.

Three pins set on 2026-10-04 or earlier had left their repositories and would have failed a fresh build: `c-ares` 1.34.8-r0, `bind9-dnsutils` deb12u2 and `dnsutils` .7.

## ℹ️ No action

- app: `brace-expansion`, `pacote`, `picomatch`, `sigstore` and `ip-address` 10.1.0 are npm's own bundled modules, under `/usr/local/lib/node_modules/npm/`. The app's own `ip-address` is a separate, newer copy.
- certbot: `wheel` (packaging tool), `binutils` (build tool), `sqlite` (no `.db` files in the image), `jaraco-context` (vendored inside setuptools).

## ℹ️ No fix available

| Image | Package | Findings |
|-------|---------|----------|
| smtp-out, postilion | unbound 1.17.1-2+deb12u4 | 2C 9H (CVE-2026-81642, CVE-2026-33278) |
| smtp-in, smtp-out, postilion | bind9 1:9.18.49-1~deb12u3 | 6H |
| smtp-in, smtp-out, postilion | util-linux 2.38.1-5+deb12u3 | 6H |
| smtp-in, smtp-out, postilion | perl 5.36.0-7+deb12u4 | 1H |
| smtp-in, smtp-out, postilion | zlib 1:1.2.13.dfsg-1 | 1H |
| smtp-in, smtp-out, postilion | cyrus-sasl2 2.1.28+dfsg-10+deb12u1 | 1H |
| logger | glib 2.86.3-r0 | 2H |
| website | libxml2 2.13.9-r2 | 1H |

The unbound findings are `libunbound8`, a dependency of OpenDKIM. See `HANDOFF_UNBOUND_IN_MAIL_IMAGES.md`.

## Deploy

Deployed in two rounds, mail images last and one at a time. smtp-in was drained first, because its queue is not on a volume. A feed smoke test sent 5 of 5, with `dkim=pass`, `spf=pass` and `dmarc=pass` at Gmail.

A rollback archive of the previous mail images is on prod at `.tmp/rollback-mail-images-2026-10-31.tar.gz`. Delete it after 2026-11-07.

The rescan took 10m51s with new images and stayed under the alert thresholds set for it.

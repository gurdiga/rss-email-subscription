# Bug List for RSS Email Subscription App

## Context

This is a comprehensive audit of the RSS-to-email subscription service codebase. The application is a production-grade system that monitors RSS feeds and delivers new items to subscribers via email, using a containerized microservices architecture with Docker Compose. The audit focused on identifying code bugs, security issues, configuration problems, and design flaws that should be addressed.

## Prioritized Bug List

#### 4. Outbound TLS not enabled in smtp-out

**Location:** [docker-services/smtp-out/entrypoint.sh](docker-services/smtp-out/entrypoint.sh)

`smtp_tls_security_level` was unset, so Postfix defaulted to no TLS when delivering to recipient mail servers. (`smtpd_tls_security_level=none` in the same file only affects inbound connections from the app, which are on the internal Docker network.)

**Fix:** Added `smtp_tls_security_level=may` — Postfix now uses STARTTLS when the recipient server offers it.

**Verification:** Send test email and confirm `TLS connection established` appears in smtp-out logs.

---

### MEDIUM (Should Fix)

#### 10. Syslog Listening on 0.0.0.0

**Location:** [docker-services/logger/syslog-ng.conf:81](docker-services/logger/syslog-ng.conf#L81)

```conf
tcp(ip("0.0.0.0") // Binds to all interfaces
```

**Impact:** While inside Docker container on isolated network, this practice exposes logs if container network isolation is compromised. No authentication required.

**Fix:** Bind to specific Docker network IP or use Unix socket for inter-container communication.

**Verification:** Verify log collection still works after binding to specific interface.

---

### LOW (Nice to Have)

#### 16. Missing Security Headers in Nginx

**Location:** [website/nginx/conf.d/website.conf](website/nginx/conf.d/website.conf)

Missing important security headers:

- `Strict-Transport-Security` (HSTS)
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Content-Security-Policy`

**Impact:** Missing client-side security protections against XSS, clickjacking, etc.

**Fix:** Add security headers to nginx configuration.

**Verification:** Check HTTP response headers with curl or browser dev tools.

---

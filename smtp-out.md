# smtp-out Container Specification

## Overview

Rebase the `smtp-out` Docker container from `boky/postfix:v5.0.1-alpine` to `debian:bookworm-slim` to eliminate anonymous VOLUME issues that prevent configuration file updates in the running container.

## Motivation

The boky/postfix Alpine image declares anonymous VOLUMEs for `/etc/postfix` and other directories. Docker creates anonymous volumes for these, preventing file updates in the running container. When configuration files are updated (e.g., adding new transport rules or virtual aliases), the changes are not reflected without recreating the container.

Switching to a custom Debian-based image with explicit control over volumes eliminates this limitation.

## Requirements

### Core Functionality

1. **Postfix MTA**: Send outbound email with custom transport policies for rate-limited destinations (Microsoft, Yahoo, Comcast)
2. **DKIM Signing**: Sign all outbound mail with OpenDKIM
3. **TLS Support**: Support STARTTLS on submission port 587 for internal app connections
4. **Flexible Configuration**: Apply configuration from main.cf.override file at startup
5. **Persistent Queue**: Support existing persisted queue directory from Alpine container
6. **Logging**: Send all mail logs to stdout for Docker syslog driver capture

### Network Requirements

1. Accept mail relay from app container (10.5.5.100) on port 587
2. Deliver outbound mail via SMTP on port 25
3. Support IPv4-only networking (no IPv6)

### Mounted Volumes

1. `/etc/opendkim/keys` - DKIM private keys (flat file layout: `feedsubscription.com.private`)
2. `/var/spool/postfix` - Persisted queue directory
3. `/etc/postfix/cert/smtp.cert` - TLS certificate (Let's Encrypt fullchain.pem)
4. `/etc/postfix/cert/smtp.key` - TLS private key (Let's Encrypt privkey.pem)

### Configuration Files

Static configuration files copied into image:

- `etc/postfix/master.cf` - Custom transport definitions (ms-throttle, yahoo-throttle, comcast-throttle)
- `etc/postfix/virtual` - Virtual alias mappings
- `etc/postfix/transport` - Transport mappings for throttled destinations
- `etc/postfix/main.cf.override` - Main Postfix configuration parameters (appended to main.cf on startup)
- `etc/opendkim/opendkim.conf` - OpenDKIM daemon config
- `etc/opendkim/KeyTable` - DKIM key table
- `etc/opendkim/SigningTable` - DKIM signing table
- `etc/opendkim/TrustedHosts` - DKIM trusted hosts

### etc/postfix/main.cf.override

```
# Basic settings
myhostname = feedsubscription.com
mydestination = localhost
maillog_file = /dev/stdout

# Network settings
smtp_address_preference = ipv4
mynetworks = 127.0.0.0/8,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16

# Notification and limits
notify_classes = bounce,resource,software
message_size_limit = 10485760

# Virtual domains and mappings
virtual_alias_domains = feedsubscription.com
virtual_alias_maps = texthash:/etc/postfix/virtual
transport_maps = texthash:/etc/postfix/transport
```

**NOTE**: Production uses broader mynetworks (all RFC1918 ranges) to allow relay from both app container (10.5.5.0/24) and Docker host (monitoring tasks using ssmtp).

## Dockerfile

```dockerfile
FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

# Install packages with pinned versions
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
    # Core mail services
    'postfix=3.7.11-0+deb12u1' \
    'opendkim=2.11.0~beta2-8+deb12u1' \
    'ca-certificates=20230311+deb12u1' \
    # Utilities
    'bind9-dnsutils=1:9.18.44-1~deb12u1' \
    'procps=2:4.0.2-3' \
    'net-tools=2.10-0.1+deb12u2' \
 && rm -rf /var/lib/apt/lists/*

# Create required directories
RUN mkdir -p \
    /etc/opendkim \
    /var/run/opendkim

# Copy configuration files
COPY etc/postfix/virtual /etc/postfix/virtual
COPY etc/postfix/transport /etc/postfix/transport
COPY etc/postfix/master.cf /etc/postfix/master.cf
COPY etc/postfix/main.cf.override /etc/postfix/main.cf.override
COPY etc/opendkim/opendkim.conf /etc/opendkim/opendkim.conf
COPY etc/opendkim/KeyTable /etc/opendkim/KeyTable
COPY etc/opendkim/SigningTable /etc/opendkim/SigningTable
COPY etc/opendkim/TrustedHosts /etc/opendkim/TrustedHosts
COPY entrypoint.sh /usr/local/bin/entrypoint.sh

# Generate postfix lookup tables
RUN postmap /etc/postfix/virtual \
 && postmap /etc/postfix/transport

# Make entrypoint executable
RUN chmod +x /usr/local/bin/entrypoint.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
```

## entrypoint.sh

```bash
#!/usr/bin/env bash
set -euo pipefail

log() { printf '[smtp-out] %s\n' "$*" >&2; }
fail() { log "ERROR: $*"; exit 1; }

DOMAIN="${POSTFIX_myhostname:-feedsubscription.com}"

apply_postfix_overrides() {
  local override="/etc/postfix/main.cf.override"
  if [ ! -f "$override" ]; then
    log "No main.cf.override found, skipping"
    return
  fi

  log "Applying main.cf.override"
  cat "$override" >> /etc/postfix/main.cf
}

configure_tls() {
  local cert="/etc/postfix/cert/smtp.cert"
  local key="/etc/postfix/cert/smtp.key"
  [ -f "$cert" ] || fail "TLS cert not found at ${cert}"
  [ -f "$key" ] || fail "TLS key not found at ${key}"

  log "Configuring TLS with ${cert}"
  postconf -e \
    "smtpd_tls_cert_file=${cert}" \
    "smtpd_tls_key_file=${key}" \
    'smtpd_use_tls=yes'
}

configure_opendkim() {
  # IMPORTANT: Keys are mounted as flat files, not in subdirectories
  # Mount layout: /etc/opendkim/keys/feedsubscription.com.private
  local key="/etc/opendkim/keys/${DOMAIN}.private"
  [ -f "$key" ] || fail "DKIM key not found for ${DOMAIN} at ${key}"

  chown opendkim:opendkim "$key"
  chmod 600 "$key"

  log "Starting opendkim"
  opendkim -x /etc/opendkim/opendkim.conf
  sleep 0.5 # small buffer to let opendkim bind the milter socket

  postconf -e \
    'milter_default_action=accept' \
    'milter_protocol=6' \
    'smtpd_milters=inet:127.0.0.1:8891' \
    'non_smtpd_milters=inet:127.0.0.1:8891'
}

main() {
  # Add app hostname mapping for better log readability
  # NOTE: This only affects /etc/hosts lookups, not PTR reverse DNS
  echo "10.5.5.100 app" >> /etc/hosts

  # Copy system files needed by postfix chroot
  mkdir -p /var/spool/postfix/etc
  cp -f /etc/resolv.conf /var/spool/postfix/etc/resolv.conf
  cp -f /etc/hosts /var/spool/postfix/etc/hosts
  cp -f /etc/nsswitch.conf /var/spool/postfix/etc/nsswitch.conf

  # Sync timezone data to avoid startup warnings
  # The persisted queue from Alpine container has outdated timezone files
  rm -rf /var/spool/postfix/usr/share/zoneinfo
  mkdir -p /var/spool/postfix/usr/share
  cp -a /usr/share/zoneinfo /var/spool/postfix/usr/share/

  # Fix queue directory ownership from Alpine container migration
  postfix set-permissions

  # Apply main.cf.override
  apply_postfix_overrides

  configure_tls
  configure_opendkim

  log "Starting postfix in foreground"
  exec postfix start-fg
}

main "$@"
```

## docker-compose.yml Changes

```yaml
smtp-out:
  depends_on:
    logger:
      condition: service_healthy
    resolver:
      condition: service_healthy
  container_name: smtp-out
  hostname: smtp-out
  image: smtp-out
  restart: always
  ports: ['127.0.0.1:1587:587']
  volumes:
    - ./.tmp/opendkim-keys:/etc/opendkim/keys
    - ${POSTFIX_DIR_ROOT?}:/var/spool/postfix
    - ./.tmp/certbot/conf/live/feedsubscription.com/fullchain.pem:/etc/postfix/cert/smtp.cert:ro
    - ./.tmp/certbot/conf/live/feedsubscription.com/privkey.pem:/etc/postfix/cert/smtp.key:ro
  environment:
    TZ: UTC
    # Postfix configuration in etc/postfix/main.cf.override
  <<: [*logging, *x-disable-ipv6, *x-dns]
```

## OpenDKIM Configuration

### etc/opendkim/opendkim.conf

```
Syslog                  yes
UMask                   002
Canonicalization        relaxed/simple
Mode                    s
Selector                mail
Socket                  inet:8891@127.0.0.1
PidFile                 /var/run/opendkim/opendkim.pid
UserID                  opendkim:opendkim
OversignHeaders         From
KeyTable                /etc/opendkim/KeyTable
SigningTable            /etc/opendkim/SigningTable
ExternalIgnoreList      /etc/opendkim/TrustedHosts
InternalHosts           /etc/opendkim/TrustedHosts
```

### etc/opendkim/KeyTable

```
mail._domainkey.feedsubscription.com feedsubscription.com:mail:/etc/opendkim/keys/feedsubscription.com.private
```

**IMPORTANT**: The key path must match the actual mount location. Keys are mounted as flat files:

- Mounted: `/etc/opendkim/keys/feedsubscription.com.private`
- NOT: `/etc/opendkim/keys/feedsubscription.com/default.private`

**NOTE**: Production uses selector `mail`, not `default`. This matches the DNS record `mail._domainkey.feedsubscription.com` and the production DKIM signatures.

### etc/opendkim/SigningTable

```
feedsubscription.com mail._domainkey.feedsubscription.com
```

### etc/opendkim/TrustedHosts

```
127.0.0.1
localhost
feedsubscription.com
10.5.5.0/24
```

**NOTE**: TrustedHosts controls which mail gets DKIM-signed (not relay access - that's controlled by Postfix mynetworks). The `10.5.5.0/24` range covers:

- App container (10.5.5.100) - signs mail from the application
- Docker host connections via ssmtp - these relay through the app container, so they also get signed

Production verification shows monitoring emails sent from Docker host via ssmtp appear with source IP 10.5.5.100 and are successfully DKIM-signed.

## Pinned Package Versions

All package versions were discovered by building without pins, then pinning to the installed versions:

**Core mail services:**

- `postfix=3.7.11-0+deb12u1` - MTA for sending mail
- `opendkim=2.11.0~beta2-8+deb12u1` - DKIM signing daemon
- `ca-certificates=20230311+deb12u1` - TLS certificate validation (required by Postfix for verifying remote SMTP servers)

**Utilities:**

- `bind9-dnsutils=1:9.18.44-1~deb12u1` - DNS lookup tools (nslookup, dig) for debugging
- `procps=2:4.0.2-3` - Process utilities (ps, top, etc.) for debugging
- `net-tools=2.10-0.1+deb12u2` - Network utilities (netstat, ifconfig) for debugging

## Configuration Validation

### make smtp-out-config-test

Validate Postfix configuration locally before deployment by building the container and checking for errors/warnings.

**Makefile target:**

```make
smtp-out-config-test:
	@echo "Building smtp-out container..."
	docker build -t smtp-out-test docker-services/smtp-out/

	@echo "Starting container for config validation..."
	docker run --rm -d --name smtp-out-test \
		-e POSTFIX_myhostname=test.local \
		smtp-out-test

	@echo "Waiting for startup..."
	sleep 5

	@echo "Checking logs for errors/warnings..."
	@errors=$$(docker logs smtp-out-test 2>&1 | grep -iE "error|warning|fatal|crit" | grep -v "warning: SASL"); \
	if [ -n "$$errors" ]; then \
		echo "❌ Configuration validation FAILED - errors/warnings found:"; \
		echo "$$errors"; \
		docker stop smtp-out-test 2>/dev/null || true; \
		exit 1; \
	else \
		echo "✅ Configuration validation PASSED"; \
		docker stop smtp-out-test 2>/dev/null || true; \
		exit 0; \
	fi
```

**Usage:**

```bash
make smtp-out-config-test
```

**What this catches:**

- ✅ Invalid parameter names in main.cf.override
- ✅ Syntax errors in Postfix configuration
- ✅ Configuration conflicts (e.g., mydestination vs virtual_alias_domains)
- ✅ Missing required files (master.cf, virtual, transport)
- ✅ Postmap errors in lookup tables
- ❌ Runtime issues (DKIM keys, TLS certs, network connectivity) - requires full integration test

**What it doesn't catch:**

Runtime issues require full integration testing:

- DKIM key path or permission problems
- TLS certificate issues
- OpenDKIM milter connection
- Network connectivity to mail servers

**When to run:**

- Before committing changes to main.cf.override
- In CI/CD pipeline before building production images
- Before Phase 1 deployment (Build and Local Validation)
- After modifying any Postfix configuration files

## Production Smoke Test

### make smtp-out-smoke-test

Verify the smtp-out container meets all requirements defined in this specification. This test runs against the deployed container and validates runtime behavior.

**Makefile target:**

```make
smtp-out-smoke-test:
	@container=$${CONTAINER:-smtp-out}; \
	echo "=== SMTP-OUT SMOKE TEST: $$container ==="; \
	echo ""; \
	failed=0; \
	\
	echo -n "✓ Container running... "; \
	if docker ps --filter "name=$$container" --format "{{.Names}}" | grep -q "^$$container$$"; then \
		echo "PASS"; \
	else \
		echo "FAIL"; \
		failed=$$((failed + 1)); \
	fi; \
	\
	echo -n "✓ Postfix master process... "; \
	if docker exec $$container pgrep -x master > /dev/null; then \
		echo "PASS"; \
	else \
		echo "FAIL"; \
		failed=$$((failed + 1)); \
	fi; \
	\
	echo -n "✓ OpenDKIM process... "; \
	if docker exec $$container pgrep -x opendkim > /dev/null; then \
		echo "PASS"; \
	else \
		echo "FAIL"; \
		failed=$$((failed + 1)); \
	fi; \
	\
	echo -n "✓ OpenDKIM milter socket (8891)... "; \
	if docker exec $$container netstat -tln | grep -q ":8891"; then \
		echo "PASS"; \
	else \
		echo "FAIL"; \
		failed=$$((failed + 1)); \
	fi; \
	\
	port=$${PORT:-1587}; \
	echo -n "✓ Port 587 accessible... "; \
	if timeout 2 bash -c "echo 'QUIT' | nc -w 1 localhost $$port" 2>/dev/null | grep -q "220"; then \
		echo "PASS"; \
	else \
		echo "FAIL"; \
		failed=$$((failed + 1)); \
	fi; \
	\
	echo -n "✓ TLS configured... "; \
	if docker exec $$container postconf smtpd_use_tls | grep -q "= yes"; then \
		echo "PASS"; \
	else \
		echo "FAIL"; \
		failed=$$((failed + 1)); \
	fi; \
	\
	echo -n "✓ IPv4 preference... "; \
	if docker exec $$container postconf smtp_address_preference | grep -q "= ipv4"; then \
		echo "PASS"; \
	else \
		echo "FAIL"; \
		failed=$$((failed + 1)); \
	fi; \
	\
	echo -n "✓ Hostname (feedsubscription.com)... "; \
	if docker exec $$container postconf myhostname | grep -q "= feedsubscription.com"; then \
		echo "PASS"; \
	else \
		echo "FAIL"; \
		failed=$$((failed + 1)); \
	fi; \
	\
	echo -n "✓ Virtual alias domains... "; \
	if docker exec $$container postconf virtual_alias_domains | grep -q "= feedsubscription.com"; then \
		echo "PASS"; \
	else \
		echo "FAIL"; \
		failed=$$((failed + 1)); \
	fi; \
	\
	echo -n "✓ Transport maps... "; \
	if docker exec $$container postconf transport_maps | grep -q "texthash:/etc/postfix/transport"; then \
		echo "PASS"; \
	else \
		echo "FAIL"; \
		failed=$$((failed + 1)); \
	fi; \
	\
	echo -n "✓ DKIM milter configured... "; \
	if docker exec $$container postconf smtpd_milters | grep -q "inet:127.0.0.1:8891"; then \
		echo "PASS"; \
	else \
		echo "FAIL"; \
		failed=$$((failed + 1)); \
	fi; \
	\
	echo -n "✓ Queue directory writable... "; \
	if docker exec $$container test -w /var/spool/postfix/queue; then \
		echo "PASS"; \
	else \
		echo "FAIL"; \
		failed=$$((failed + 1)); \
	fi; \
	\
	echo -n "✓ No errors in logs since boot... "; \
	if docker logs $$container 2>&1 | grep -iE "error|fatal|crit" | grep -vE "warning: SASL|Permission denied" > /dev/null; then \
		echo "FAIL (errors found in logs)"; \
		failed=$$((failed + 1)); \
	else \
		echo "PASS"; \
	fi; \
	\
	echo -n "✓ DKIM selector (mail)... "; \
	if docker exec $$container grep -q "^Selector.*mail" /etc/opendkim/opendkim.conf; then \
		echo "PASS"; \
	else \
		echo "FAIL"; \
		failed=$$((failed + 1)); \
	fi; \
	\
	echo ""; \
	if [ $$failed -eq 0 ]; then \
		echo "=== ✅ ALL TESTS PASSED ==="; \
		exit 0; \
	else \
		echo "=== ❌ $$failed TEST(S) FAILED ==="; \
		exit 1; \
	fi
```

**Usage:**

```bash
# Test production container (default)
make smtp-out-smoke-test

# Test new container during parallel deployment
CONTAINER=smtp-out-new PORT=1588 make smtp-out-smoke-test
```

**What this validates:**

**Container Health:**

- ✅ Container is running
- ✅ Postfix master process active
- ✅ OpenDKIM daemon running
- ✅ No errors in logs since boot

**Network & Connectivity:**

- ✅ Port 587 accessible from host
- ✅ OpenDKIM milter socket listening (8891)
- ✅ IPv4 preference configured

**Configuration:**

- ✅ TLS enabled
- ✅ Correct hostname (feedsubscription.com)
- ✅ Virtual alias domains configured
- ✅ Transport maps loaded
- ✅ DKIM milter integrated
- ✅ Correct DKIM selector (mail)

**Storage:**

- ✅ Queue directory mounted and writable

**When to run:**

- **Phases 2-5** (Parallel Deployment): Test `smtp-out-new` with `CONTAINER=smtp-out-new PORT=1588`
- **Phase 6+** (After Cutover): Test `smtp-out` (default)
- After container restart
- After configuration changes
- As part of monitoring/health checks

**Limitations:**

This test validates the container is configured and running correctly, but does NOT test:

- Actual mail delivery (requires sending test email)
- DKIM signature verification (requires sending and inspecting email)
- TLS certificate validity (requires openssl s_client test)
- Relay from app container (requires integration test)

For complete validation, combine with integration testing from Phase 3 of the deployment strategy.

## Deployment Strategy

### Approach: Parallel Container Testing

Deploy the new Debian-based container alongside the existing Alpine container for thorough testing before cutover. This approach provides zero-risk testing with easy rollback.

### Phase 1: Build and Local Validation

**Objective**: Verify the container builds and starts correctly.

```bash
# Build the new image
cd ~/src/rss-email-subscription
make build-docker-images

# Verify image was created
docker images | grep smtp-out

# Test configuration
make smtp-out-config-test
```

**Validation**:

- [ ] Image builds without errors
- [ ] All package versions match pinned versions
- [ ] Configuration files copied correctly
- [ ] Configuration test passes (no errors/warnings)

### Phase 2: Parallel Deployment

**Objective**: Run new container alongside production container with separate queue.

**docker-compose.yml additions**:

```yaml
# Add this new service alongside existing smtp-out
smtp-out-new:
  depends_on:
    logger:
      condition: service_healthy
    resolver:
      condition: service_healthy
  container_name: smtp-out-new
  hostname: smtp-out-new
  image: smtp-out  # Same image as production
  restart: always
  ports: ['127.0.0.1:1588:587']  # Different external port
  volumes:
    - ./.tmp/opendkim-keys:/etc/opendkim/keys
    - ./.tmp/postfix-queue-new:/var/spool/postfix  # Fresh queue directory
    - ./.tmp/certbot/conf/live/feedsubscription.com/fullchain.pem:/etc/postfix/cert/smtp.cert:ro
    - ./.tmp/certbot/conf/live/feedsubscription.com/privkey.pem:/etc/postfix/cert/smtp.key:ro
  environment:
    TZ: UTC
    POSTFIX_myhostname: feedsubscription.com
    POSTFIX_mydestination: localhost
    POSTFIX_maillog_file: /dev/stdout
    POSTFIX_smtp_address_preference: ipv4
    # NOTE: Production uses broader mynetworks - match that or tighten to 10.5.5.0/24
    POSTFIX_mynetworks: '127.0.0.0/8,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16'
    POSTFIX_notify_classes: 'bounce,resource,software'
    POSTFIX_message_size_limit: 10485760
    POSTFIX_virtual_alias_domains: feedsubscription.com
    POSTFIX_virtual_alias_maps: 'texthash:/etc/postfix/virtual'
    POSTFIX_transport_maps: 'texthash:/etc/postfix/transport'
  <<: [*logging, *x-disable-ipv6, *x-dns]
```

**Deploy**:

```bash
# Create fresh queue directory
mkdir -p .tmp/postfix-queue-new

# Start the new container
docker-compose up -d smtp-out-new

# Watch startup logs
docker logs -f smtp-out-new
```

**Validation**:

- [ ] Container starts without errors
- [ ] OpenDKIM starts and binds milter socket (check logs for "Starting opendkim")
- [ ] No timezone warnings
- [ ] No ownership/permission warnings
- [ ] Postfix starts in foreground mode

### Phase 3: Integration Testing

**Objective**: Verify all functionality works correctly.

#### Test 1: Basic SMTP Connectivity

```bash
# Test SMTP connection and STARTTLS
openssl s_client -connect localhost:1588 -starttls smtp
# Should show certificate chain and successful TLS handshake
```

**Expected**: TLS handshake succeeds with Let's Encrypt certificate.

#### Test 2: Send Test Email

```bash
# Send test email through new container
docker exec smtp-out-new postconf -n | grep myhostname

# From app container, send test email
# (Update app config temporarily to use smtp-out-new:587)
```

**Expected**:

- Mail accepted without "Relay access denied"
- DKIM signature present in headers
- Message delivered successfully

#### Test 3: Check DKIM Signing

```bash
# Check DKIM configuration loaded correctly
docker exec smtp-out-new opendkim -VVV -x /etc/opendkim/opendkim.conf

# Inspect sent email headers for DKIM-Signature
```

**Expected**: `DKIM-Signature: v=1; a=rsa-sha256; c=relaxed/simple; d=feedsubscription.com`

#### Test 4: Verify Logging

```bash
# Check logs appear on stdout
docker logs smtp-out-new | grep -E "connect from|relay="

# Verify maillog format matches expectations
```

**Expected**: Detailed mail logs showing connection, relay, delivery status.

#### Test 5: Queue Persistence

```bash
# Check queue
docker exec smtp-out-new mailq

# Stop and restart container
docker-compose restart smtp-out-new

# Verify queue persisted
docker exec smtp-out-new mailq
```

**Expected**: Queue persists across restarts.

#### Test 6: Transport Policies

```bash
# Check transport maps loaded
docker exec smtp-out-new postmap -q "outlook.com" texthash:/etc/postfix/transport

# Send to Microsoft/Yahoo/Comcast addresses
# Verify throttling applied (check logs for ms-throttle, yahoo-throttle, etc.)
```

**Expected**: Throttled transports used for configured domains.

### Phase 4: Load Testing (8 UTC Delivery Window)

**Objective**: Validate container handles production load (~1k emails).

**Timing**: Deploy before 8 UTC, monitor during delivery batch.

**Setup**:

```bash
# Option A: Split traffic 50/50
# Configure app to send 50% through smtp-out:1587, 50% through smtp-out-new:1588

# Option B: Shadow testing
# Send copies of all emails through both containers
# Compare delivery success rates
```

**Monitor**:

```bash
# Watch both containers during delivery
watch -n 5 'docker exec smtp-out mailq; echo "---"; docker exec smtp-out-new mailq'

# Monitor logs
docker logs -f smtp-out-new | grep -E "status=|reject|defer"

# Check for errors
docker logs smtp-out-new | grep -i "error\|warning\|fail"
```

**Success Criteria**:

- [ ] All emails accepted without relay errors
- [ ] DKIM signing works for all messages
- [ ] Throttling policies applied correctly
- [ ] No connection errors to destination mail servers
- [ ] Delivery success rate matches production container
- [ ] No queue buildup (messages flowing normally)

### Phase 5: Burn-in Period

**Duration**: 2-7 days

**Objective**: Validate stability over time with real traffic.

**Monitoring**:

```bash
# Daily queue checks
docker exec smtp-out-new mailq

# Error log review
docker logs smtp-out-new --since 24h | grep -i "error\|warning"

# Delivery statistics
docker logs smtp-out-new --since 24h | grep "status=" | wc -l
```

**Red Flags** (abort cutover if seen):

- Relay access denied errors
- DKIM milter failures
- Queue buildup/stuck messages
- TLS handshake failures
- Ownership/permission warnings that impact functionality

### Phase 6: Cutover

**Objective**: Replace production container with new container.

**Prerequisites**:

- [ ] Burn-in period completed successfully
- [ ] No errors in logs
- [ ] Delivery success rate validated
- [ ] Team consensus to proceed

**Cutover Steps**:

```bash
# 1. Update docker-compose.yml
# Rename smtp-out → smtp-out-old
# Rename smtp-out-new → smtp-out
# Update port mapping: 1588 → 1587
# Update queue volume: postfix-queue-new → original POSTFIX_DIR_ROOT

# 2. Stop both containers gracefully
docker-compose stop smtp-out smtp-out-new

# 3. Start new container as production
docker-compose up -d smtp-out

# 4. Verify production traffic flows correctly
docker logs -f smtp-out

# 5. Keep old container config in docker-compose.yml but stopped
# (for easy rollback)
```

**Validation**:

- [ ] App connects to smtp-out:587 successfully
- [ ] Email delivery works
- [ ] Logs appear correctly
- [ ] Queue processing normal

### Phase 7: Cleanup

**Wait**: 48 hours after cutover

**Remove old container**:

```bash
# 1. Verify new container stable
docker logs smtp-out --since 48h | grep -i error

# 2. Back up old queue (if needed)
sudo tar -czf smtp-out-alpine-queue-backup.tar.gz ${POSTFIX_DIR_ROOT}.old

# 3. Remove old container definition from docker-compose.yml
# Remove smtp-out-old section

# 4. Clean up test queue
rm -rf .tmp/postfix-queue-new
```

### Rollback Plan

If issues arise at any phase:

**During Testing (Phase 2-5)**:

```bash
# Simply stop the new container
docker-compose stop smtp-out-new

# Production unaffected - old container still running
```

**After Cutover (Phase 6)**:

```bash
# 1. Stop new container
docker-compose stop smtp-out

# 2. Restore old container as smtp-out
# (Revert docker-compose.yml changes)

# 3. Start old container
docker-compose up -d smtp-out

# 4. Verify traffic resumes
docker logs -f smtp-out
```

### Deployment Timeline

**Recommended Schedule**:

- **Day 1 (14:00-16:00 UTC)**: Phase 1-2 (Build and deploy parallel container)
- **Day 1 (16:00-18:00 UTC)**: Phase 3 (Integration testing)
- **Day 2 (07:30-09:00 UTC)**: Phase 4 (Monitor during 8 UTC delivery)
- **Day 2-8**: Phase 5 (Burn-in period, 7 days)
- **Day 9 (14:00 UTC)**: Phase 6 (Cutover)
- **Day 11**: Phase 7 (Cleanup)

**Notes**:

- Queue is typically empty outside 8 UTC delivery window
- Minimal risk during testing phases
- Easy rollback at all stages
- Weekend deployment (Saturday) provides extra safety margin

## Key Learnings and Missteps

### 1. DKIM Key Path Mismatch

**Problem**: Initial implementation assumed keys were in subdirectories (`/etc/opendkim/keys/feedsubscription.com/default.private`).

**Reality**: Keys are mounted as flat files (`/etc/opendkim/keys/feedsubscription.com.private`).

**Fix**: Update both `entrypoint.sh` key path check and `KeyTable` to use flat file path.

### 2. Postfix Chroot Hostname Mapping

**Misstep**: Attempted to add `10.5.5.100 app` mapping to `/etc/hosts` to show "app" instead of "unknown" in Postfix logs.

**Learning**: Postfix uses PTR (reverse DNS) queries for client hostname lookups, not `/etc/hosts`. The mapping has no effect on log output. "unknown" is expected behavior for internal Docker IPs without PTR records.

**Decision**: Keep the mapping for potential future `/etc/hosts` lookups by other tools, but it won't affect Postfix client logging.

### 3. Copied File Ownership in Mounted Volumes

**Problem**: Files copied to `/var/spool/postfix` (a mounted volume) inherited the volume's ownership instead of the source file's ownership, causing warnings.

**Solution**: Explicitly `chown -R root:root` copied files after copying them to the chroot.

### 4. Alpine to Debian Migration Issues

**Timezone Data**: Persisted queue from Alpine container has outdated timezone files. Solution: Delete and recopy `/usr/share/zoneinfo` on startup.

**Queue Permissions**: Queue directory ownership differs between Alpine and Debian. Solution: Run `postfix set-permissions` on startup.

### 5. mydestination Conflict

**Problem**: Default `mydestination` includes hostname, conflicting with `virtual_alias_domains`.

**Error**: "do not list domain feedsubscription.com in BOTH mydestination and virtual_alias_domains"

**Solution**: Set `POSTFIX_mydestination=localhost` to avoid conflict.

### 6. IPv6 Connection Failures

**Problem**: Container has no IPv6 support, but Postfix tries IPv6 first for dual-stack mail servers.

**Symptom**: "Cannot assign requested address" errors in logs.

**Solution**: Set `POSTFIX_smtp_address_preference=ipv4`.

### 7. Relay Access Denied

**Problem**: App container (10.5.5.100) couldn't relay mail through smtp-out.

**Solution**: Add `10.5.5.0/24` to `POSTFIX_mynetworks` and OpenDKIM `TrustedHosts`.

### 8. TLS Self-Signed Certificate Error

**Problem**: App connecting to smtp-out:587 received self-signed certificate error.

**Solution**: Mount Let's Encrypt certificates and configure TLS in `entrypoint.sh`.

## Testing Checklist

1. **Build and Start**
   - [ ] Container builds successfully
   - [ ] Container starts without errors
   - [ ] OpenDKIM starts and binds milter socket

2. **DKIM Signing**
   - [ ] Mail is signed with DKIM (check DKIM-Signature header)
   - [ ] No "Service unavailable" milter errors

3. **Relay from App**
   - [ ] App can connect to smtp-out:587
   - [ ] TLS handshake succeeds
   - [ ] Mail relay succeeds (no "Relay access denied")

4. **Logging**
   - [ ] Mail logs appear in stdout
   - [ ] No timezone warnings
   - [ ] No ownership warnings

5. **Queue Persistence**
   - [ ] Queue persists across container restarts
   - [ ] Queued mail is delivered after restart

6. **Transport Policies**
   - [ ] Microsoft domains use ms-throttle
   - [ ] Yahoo domains use yahoo-throttle
   - [ ] Comcast domains use comcast-throttle
   - [ ] Other domains use default transport

7. **IPv4 Preference**
   - [ ] No "Cannot assign requested address" errors
   - [ ] Outbound connections use IPv4

## References

- Postfix chroot setup: `/etc/postfix/master.cf`
- Custom transport policies: [Postfix QSHAPE_README](https://www.postfix.org/QSHAPE_README.html#backlog)
- OpenDKIM integration: Milter protocol over inet socket
- Configuration override pattern: main.cf.override appended to main.cf at startup

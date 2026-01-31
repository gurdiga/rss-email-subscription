# Implementation Plan: Build smtp-out-new (Debian-based)

## Overview

Build a new `smtp-out-new` container based on `debian:bookworm-slim` following the specification in [smtp-out.md](smtp-out.md). This container will run alongside the existing Alpine-based `smtp-out` for testing before replacing it.

## Strategy

**Parallel Deployment Approach:**
1. Build `smtp-out-new` in separate directory (`docker-services/smtp-out-new/`)
2. Deploy alongside existing `smtp-out` (different port, separate queue)
3. Switch app to use `smtp-out-new` via SMTP_CONNECTION_STRING or app config
4. Test and monitor for a few days
5. If successful, remove old `smtp-out` container

**Benefits:**
- Zero risk: old container keeps running
- Easy rollback: just switch back to old container
- Side-by-side comparison of logs and behavior

## Current State

**Existing smtp-out (Alpine-based):**
- Container: `smtp-out` on port 1587
- Directory: `docker-services/smtp-out/`
- Status: Keep running during testing

**New smtp-out-new (Debian-based):**
- Container: `smtp-out-new` on port 1588
- Directory: `docker-services/smtp-out-new/` (to create)
- Status: New implementation

## Files to Create

**New directory:** `docker-services/smtp-out-new/`

All files will be created in this new directory:
- `Dockerfile` - Debian bookworm-slim based
- `entrypoint.sh` - Container initialization script
- `etc/postfix/main.cf.override` - Postfix configuration
- `etc/postfix/virtual` - Copy from smtp-out
- `etc/postfix/transport` - Copy from smtp-out
- `etc/postfix/master.cf` - Copy from smtp-out
- `etc/opendkim/opendkim.conf` - OpenDKIM daemon config
- `etc/opendkim/KeyTable` - DKIM key table
- `etc/opendkim/SigningTable` - DKIM signing table
- `etc/opendkim/TrustedHosts` - Trusted hosts for DKIM

## Implementation Steps

### 1. Create Directory Structure

Create the new smtp-out-new directory with subdirectories:

```bash
mkdir -p docker-services/smtp-out-new/etc/postfix
mkdir -p docker-services/smtp-out-new/etc/opendkim
```

### 2. Copy Existing Postfix Config Files

Copy the 3 working Postfix config files from the old smtp-out:

```bash
cp docker-services/smtp-out/etc/postfix/virtual docker-services/smtp-out-new/etc/postfix/
cp docker-services/smtp-out/etc/postfix/transport docker-services/smtp-out-new/etc/postfix/
cp docker-services/smtp-out/etc/postfix/master.cf docker-services/smtp-out-new/etc/postfix/
```

### 3. Create OpenDKIM Configuration Files

**Directory:** `docker-services/smtp-out-new/etc/opendkim/`

Create 4 OpenDKIM configuration files with exact content from smtp-out.md (lines 237-277):
- `opendkim.conf` - Daemon configuration (selector: mail, socket: inet:8891)
- `KeyTable` - Key path mapping (flat file: `feedsubscription.com.private`)
- `SigningTable` - Domain to key mapping
- `TrustedHosts` - Trusted IPs (127.0.0.1, localhost, feedsubscription.com, 10.5.5.0/24)

### 4. Create Postfix Configuration Override

**File:** `docker-services/smtp-out-new/etc/postfix/main.cf.override`

Create with content from smtp-out.md (lines 52-70):
- Basic settings: hostname, destination, logging to stdout
- Network: IPv4 preference, mynetworks for relay access
- Limits: message size, notification classes
- Virtual domains and transport maps

### 5. Create Entrypoint Script

**File:** `docker-services/smtp-out-new/entrypoint.sh`

Create simplified bash script (adapted from smtp-out.md lines 122-206) that:
- Applies main.cf.override to Postfix configuration
- Configures TLS with Let's Encrypt certificates
- Starts OpenDKIM and integrates milter
- Copies chroot files (resolv.conf, hosts, nsswitch.conf)
- Starts Postfix in foreground

### 6. Create Dockerfile

**File:** `docker-services/smtp-out-new/Dockerfile`

Create Debian-based version from smtp-out.md (lines 76-118):
- Base: `debian:bookworm-slim`
- Pinned packages: postfix 3.7.11, opendkim 2.11.0~beta2, ca-certificates, utilities
- Copy all 8 config files (3 postfix + 1 override + 4 opendkim)
- Run postmap on virtual and transport tables
- Set executable permissions on entrypoint.sh

### 7. Add Makefile Build Target

**File:** `Makefile`

Add build target for smtp-out-new (after existing smtp-out target):

```make
smtp-out-new:
	@mkdir -p .tmp/logs/feedsubscription
	docker build -t smtp-out-new docker-services/smtp-out-new/ \
		> .tmp/logs/feedsubscription/docker-build-smtp-out-new.log 2>&1
```

### 8. Add Makefile Test Targets

Add two test targets:

**a) smtp-out-new-config-test**
- Builds test container
- Validates configuration without runtime dependencies
- Checks for errors/warnings (excluding SASL warnings)

**b) smtp-out-new-smoke-test**
- Validates running container (14 checks)
- Tests processes, ports, TLS, DKIM, configuration
- Usage: `CONTAINER=smtp-out-new PORT=1588 make smtp-out-new-smoke-test`

### 9. Add docker-compose.yml Service

**File:** `docker-compose.yml`

Add new `smtp-out-new` service alongside existing `smtp-out`:

```yaml
smtp-out-new:
  depends_on:
    logger:
      condition: service_healthy
    resolver:
      condition: service_healthy
  container_name: smtp-out-new
  hostname: smtp-out-new
  image: smtp-out-new
  restart: always
  ports: ['127.0.0.1:1588:587']  # Different port from smtp-out (1587)
  volumes:
    - ./.tmp/opendkim-keys:/etc/opendkim/keys
    - ./.tmp/postfix-queue-new:/var/spool/postfix  # Separate queue directory
    - ./.tmp/certbot/conf/live/feedsubscription.com/fullchain.pem:/etc/postfix/cert/smtp.cert:ro
    - ./.tmp/certbot/conf/live/feedsubscription.com/privkey.pem:/etc/postfix/cert/smtp.key:ro
  environment:
    TZ: UTC
    # Postfix configuration in etc/postfix/main.cf.override
  networks:
    net:
      ipv4_address: 10.5.5.10  # Different IP from smtp-out (10.5.5.9)
  dns: 10.5.5.2
  sysctls:
    - net.ipv6.conf.all.disable_ipv6=1
    - net.ipv6.conf.default.disable_ipv6=1
    - net.ipv6.conf.lo.disable_ipv6=1
  logging:
    driver: syslog
    options:
      syslog-address: tcp://10.5.5.1:514
      syslog-format: rfc3164
      tag: '{{.Name}}'
```

**Key differences from old smtp-out:**
- Container name: `smtp-out-new` (vs `smtp-out`)
- External port: `1588` (vs `1587`)
- Queue directory: `./.tmp/postfix-queue-new` (vs `${POSTFIX_DIR_ROOT}`)
- IP address: `10.5.5.10` (vs `10.5.5.9`)
- Added TLS certificate mounts
- Simplified environment (config now in main.cf.override)

## Deployment and Testing

### Phase 1: Build and Validate Configuration

```bash
cd ~/src/rss-email-subscription

# Build the new image
make smtp-out-new

# Test configuration (doesn't require runtime dependencies)
make smtp-out-new-config-test

# Verify image created
docker images | grep smtp-out-new
```

**Validation checklist:**
- [ ] Image builds without errors
- [ ] Configuration test passes (no Postfix errors/warnings)
- [ ] All files copied correctly

### Phase 2: Deploy Alongside Existing Container

```bash
# Create fresh queue directory for new container
mkdir -p .tmp/postfix-queue-new

# Start the new container
docker-compose up -d smtp-out-new

# Watch startup logs
docker logs -f smtp-out-new
```

**Check startup logs for:**
- [ ] OpenDKIM starts successfully
- [ ] Postfix starts in foreground
- [ ] No TLS certificate errors
- [ ] No DKIM key errors
- [ ] No timezone or permission warnings

### Phase 3: Run Smoke Tests

```bash
# Run comprehensive smoke test on new container
CONTAINER=smtp-out-new PORT=1588 make smtp-out-new-smoke-test
```

**Expected results:**
- [ ] All 14 checks pass
- [ ] Container running
- [ ] Postfix and OpenDKIM processes active
- [ ] Port 587 accessible internally
- [ ] TLS configured correctly
- [ ] DKIM milter integrated

### Phase 4: Switch App to New Container

The app needs to connect to the new smtp-out-new container. There are two approaches:

**Option A: Change app connection string**

If the app uses `SMTP_CONNECTION_STRING`, update it to point to the new container:
```
# In app configuration
smtp://smtp-out-new:587
```

**Option B: Update app's SMTP host setting**

Check how the app currently connects to smtp-out and update it to use `smtp-out-new` as the hostname.

### Phase 5: Test Email Delivery

```bash
# Send a test email through the new container
# (Use your app's test email functionality)

# Check logs for delivery
docker logs smtp-out-new | tail -20

# Verify DKIM signature in received email headers
# Look for: DKIM-Signature: v=1; a=rsa-sha256; d=feedsubscription.com
```

**Validation checklist:**
- [ ] Email accepted without "Relay access denied"
- [ ] DKIM signature present in headers
- [ ] Email delivered successfully
- [ ] No errors in logs

### Phase 6: Monitor for a Few Days

Run the new container in parallel with monitoring:

```bash
# Check queue status daily
docker exec smtp-out-new mailq

# Review logs for errors
docker logs smtp-out-new --since 24h | grep -iE "error|warning|fatal"

# Compare with old container
docker logs smtp-out --since 24h | grep -iE "error|warning|fatal"
```

**Monitor for:**
- Delivery success rate
- Queue buildup (should be empty outside delivery window)
- TLS handshake issues
- DKIM signing failures
- Relay access errors

**Success criteria:**
- [ ] No errors in logs for 2-3 days
- [ ] All emails delivered successfully
- [ ] Queue processes normally
- [ ] DKIM signatures working
- [ ] No performance issues

### Phase 7: Remove Old Container

After successful monitoring period:

```bash
# Stop and remove old container
docker-compose stop smtp-out
docker-compose rm smtp-out

# Remove old service from docker-compose.yml
# (Delete smtp-out service definition)

# Rename smtp-out-new to smtp-out in docker-compose.yml
# (Change container name, hostname, port 1588→1587, IP if needed)

# Restart with new name
docker-compose up -d smtp-out

# Verify everything still works
docker logs -f smtp-out
```

### Rollback Plan

If issues occur at any phase, rollback is simple:

**During testing (Phase 3-5):**
```bash
# Switch app back to old container
# Update connection string to: smtp://smtp-out:587

# Stop new container
docker-compose stop smtp-out-new
```

**After switching (Phase 6):**
```bash
# Switch app back to old container
# Stop new container
docker-compose stop smtp-out-new
docker-compose up -d smtp-out

# Old container resumes immediately
```

## Critical Files to Create

All files in new directory: `docker-services/smtp-out-new/`

**New files:**
1. `Dockerfile` - Debian bookworm-slim based image
2. `entrypoint.sh` - Container initialization script
3. `etc/postfix/main.cf.override` - Postfix configuration
4. `etc/opendkim/opendkim.conf` - OpenDKIM daemon config
5. `etc/opendkim/KeyTable` - DKIM key table
6. `etc/opendkim/SigningTable` - DKIM signing table
7. `etc/opendkim/TrustedHosts` - Trusted hosts

**Copied from smtp-out:**
8. `etc/postfix/virtual` - Email alias mappings
9. `etc/postfix/transport` - Throttling rules
10. `etc/postfix/master.cf` - Custom transport definitions

**Modifications to existing files:**
11. `Makefile` - Add `smtp-out-new` build target and 2 test targets
12. `docker-compose.yml` - Add `smtp-out-new` service

## Summary

**What gets created:**
- New `smtp-out-new` directory with all Debian-based files
- New `smtp-out-new` service in docker-compose.yml
- New Makefile targets for building and testing

**What stays unchanged:**
- Existing `smtp-out` container (Alpine-based)
- Existing `smtp-out` service in docker-compose.yml
- Old `docker-services/smtp-out/` directory

**Timeline:**
1. Build and deploy smtp-out-new (1-2 hours)
2. Test and switch app to use it (1 hour)
3. Monitor for 2-3 days
4. Remove old smtp-out if successful

## Notes

- Entrypoint script simplified from smtp-out.md (removed Alpine migration steps)
- Fresh queue directory (.tmp/postfix-queue-new) means no timezone sync or ownership fixes needed
- DKIM keys use flat file structure: `feedsubscription.com.private`
- DKIM selector is "mail" (matches DNS records)
- Pinned Debian package versions for reproducibility
- Separate queue directory prevents interference with old container
- Different port (1588) allows parallel operation

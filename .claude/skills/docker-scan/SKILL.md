---
name: docker-scan
description: Automates Docker image vulnerability scanning using Docker Scout. Generates structured security reports showing HIGH and CRITICAL CVEs, compares with previous scans, suggests fixes. Use when the user requests a Docker security scan, vulnerability check, or mentions Docker Scout, image security, or CVE scanning.
---

# Docker Security Scanner

Automates Docker image vulnerability scanning and security report generation for regular security audits.

## When to use

Use this skill when the user:
- Requests "Docker security scan" or "check Docker images"
- Mentions "Docker Scout", "CVE scan", or "image vulnerabilities"
- Asks to compare with a previous security scan
- Wants a security report for Docker containers

## Quick start

Scan all production images and generate a report:

1. Find production images from the Makefile:
```bash
grep "^all-images:" Makefile
```
Output: `all-images: app certbot delmon logger smtp-in smtp-out website resolver`

2. Check Docker Scout version:
```bash
docker scout version 2>&1 | grep "version"
```

3. Scan each image and generate `image-check-YYYY-MM-DD.md`

## Workflow

### Step 1: Discover images

Get the production image list from the Makefile — it's the source of truth:

```bash
grep "^all-images:" Makefile
```

Confirm images exist locally:
```bash
docker images --format "{{.Repository}}:{{.Tag}}" | grep -v "<none>" | sort
```

If an image is missing, ask the user whether to build it first.

### Step 2: Scan for vulnerability counts

Run scans in background, **max 4 at a time** to avoid BuildKit cache conflicts:

```bash
docker scout cves <image>:latest 2>&1 | grep -E "vulnerabilities found|^  CRITICAL|^  HIGH|^  MEDIUM|^  LOW" | tail -5 &
```

Wait for each batch to complete before starting the next. Collect counts in this format:
```
14 vulnerabilities found in 8 packages
  CRITICAL  0
  HIGH      10
  MEDIUM    1
  LOW       3
```

### Step 3: Get HIGH/CRITICAL package details

For each image with HIGH or CRITICAL findings, run sequentially (not in parallel):

```bash
docker scout cves <image>:latest --only-severity high,critical --format only-packages 2>&1 | grep -E "│.*[1-9][CH]|✗|vulnerable"
```

To get specific CVE IDs and fix versions for flagged packages:

```bash
docker scout cves <image>:latest 2>&1 | grep -B2 -A8 "✗ HIGH\|✗ CRITICAL" | grep -E "✗|CVE|Fixed version" | head -40
```

### Step 4: Categorize vulnerabilities

For each vulnerable package, determine the category:

**Fixable**: Has a "Fixed version" in Scout output — act on these.

**npm-bundled (Node.js images)**: tar, glob, minimatch appearing in Node.js images
are npm's own internal modules, not app code. Verify:
```bash
docker run --rm <image>:latest sh -c 'ls node_modules/tar node_modules/glob 2>/dev/null || echo "not in app"'
# Then check npm internals:
docker run --rm <image>:latest sh -c 'find /usr/local/lib/node_modules/npm -name "package.json" -path "*/tar/package.json" | head -3'
```
If found only in `/usr/local/lib/node_modules/npm/`, these are npm internals —
exploitable only during `npm install`, not at runtime. **No action needed.**

**Alpine pin staleness**: After bumping one Alpine package pin, `apk upgrade` may
have already moved other pinned packages to newer versions, making those pins
stale downgrades. If a build fails with `ERROR: unable to select packages`, check
which packages `apk upgrade` upgraded:
```bash
docker run --rm <base-image> sh -c 'apk update -q && apk upgrade --simulate 2>&1'
```
Update any stale pins to match.

**Build-stage only (multi-stage Dockerfiles)**: Packages in build stages that
aren't copied to the final image. Verify by running a container and checking:
```bash
docker run --rm <image>:latest sh -c 'apk info | grep <package>'
```

**No fix available**: Scout shows "Fixed version: not fixed" — document and monitor.

### Step 5: Assess runtime impact before fixing

Not all flagged packages warrant action. Assess each by its actual runtime role:

| Package type | Example | Runtime impact | Action |
|---|---|---|---|
| Core runtime lib | openssl, cryptography | High — fix immediately | Yes |
| Build tool | wheel, pip | None — never called at runtime | No |
| stdlib dep, unused | sqlite in certbot | None — app doesn't use it | No |
| npm devDependency | glob, minimatch pruned by `npm prune --omit=dev` | None | No |
| npm-bundled internal | tar in `/usr/local/lib/node_modules/npm/` | None at runtime | No |

For Python packages, check if the application actually uses them:
- `wheel`: packaging tool, never called after install
- `sqlite`: check if app opens any `.db` files or uses `import sqlite3`
- `cryptography`: used at runtime for TLS/ACME (e.g. certbot) — fix this

### Step 6: Generate report

Create `image-check-YYYY-MM-DD.md` with today's date.

**Summary table**:
```markdown
| Image | Critical | High | Medium | Low | Status |
|-------|----------|------|--------|-----|--------|
```

**HIGH/CRITICAL details** (grouped by image, include CVE IDs and fix versions):
```markdown
| Package | Version | Type | Vuln | CVE | Fix |
|---------|---------|------|------|-----|-----|
```

**Action plan** sections:
- `🔴 Immediate` — fixable runtime vulnerabilities
- `⚠️ Short-term` — base image packages (apt-get upgrade)
- `ℹ️ No action` — npm internals, build tools, unused stdlib deps
- `ℹ️ No fix available` — awaiting upstream patches

### Step 7: Compare with previous scan (optional)

Look for the most recent previous report:
```bash
ls -1t image-check-*.md | head -5
```

Identify new CVEs, fixed CVEs, and count changes since last scan.

## Common fix patterns

### Alpine package pin update

```dockerfile
ARG OPENSSL_VERSION=3.3.6-r0
RUN apk add --no-cache --upgrade "openssl=${OPENSSL_VERSION}"
```

After changing any pin, test the build locally first — other pinned packages in
the same `apk add` command may now be stale and cause build failure.

### Python package upgrade

```dockerfile
RUN python -m pip install --no-cache-dir 'cryptography>=46.0.5'
```

After installing, verify there are no critical dependency conflicts:
```bash
docker run --rm <image>:latest python -c "import <package>; print('ok')"
```

For certbot specifically, also verify pyopenssl compatibility:
```bash
docker exec certbot python -c "import certbot; import OpenSSL; print('ok')"
```

### Debian/Ubuntu base packages (boky/postfix, Ubuntu resolver)

```dockerfile
RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*
```

## Troubleshooting

**Docker not running**:
```bash
docker info >/dev/null 2>&1 || (open -a Docker && sleep 5)
```

**Cache conflict / empty output from background scan**:
Run at most 4 scans concurrently. If a scan produces empty output, re-run it
sequentially after the others complete.

**`grep "vulnerabilities │"` produces no output**:
Scout's output format does not use `│` in the summary line. Use instead:
```bash
docker scout cves <image>:latest 2>&1 | grep -E "vulnerabilities found|^  CRITICAL|^  HIGH|^  MEDIUM|^  LOW" | tail -5
```

**`unable to select packages` build error after pin update**:
`apk upgrade` ran first and upgraded that package past the pinned version.
Check what version is now current and update the pin:
```bash
docker run --rm <base-image> sh -c 'apk update -q 2>/dev/null; apk info <package> | head -1'
```

**pyopenssl `cryptography<46` conflict warning**:
This is an overly conservative constraint in pyopenssl's metadata. Test actual
compatibility rather than treating the warning as a blocker.

## Best practices

1. **Scan monthly**: Every 4 weeks is a good cadence
2. **Compare scans**: Use previous reports to track progress
3. **Assess runtime impact before fixing**: Not every Scout finding needs action
4. **Verify npm packages**: Node.js images almost always show npm-internal tar/glob/minimatch — confirm before treating as vulnerabilities
5. **Test builds locally before committing**: Alpine pin changes may break builds
6. **Verify after deploy**: Run import checks after Python package upgrades in production

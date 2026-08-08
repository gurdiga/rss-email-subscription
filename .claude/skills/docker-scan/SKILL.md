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

## Scan target

**Always scan the prod server images directly** — images are built on prod and some
update system packages at build time, so a local rebuild would not reflect prod state.

The script takes an optional `prod` (default) or `local` argument. `local` scans
the local Docker daemon's images; use it only to exercise the script or when prod
is unreachable, and label any report produced from it as non-authoritative.

## Prod prerequisites

Two independent things must hold on prod. Both were broken until 2026-08-08, and
each fails with a message that does not name the real cause.

**1. Docker Hub credentials.** `docker scout` uploads an image index to Docker's
backend and gets advisories back, so it needs an authenticated account. Without
it: `please login using Docker Desktop or 'docker login' command`.

```bash
ssh -S ~/.ssh/control-feedsubscription feedsubscription.com \
  "grep -q index.docker.io ~/.docker/config.json && echo 'logged in' || echo 'NOT logged in'"
```

Prod has no credential helper, so the token is stored base64-encoded (not
encrypted) in `/root/.docker/config.json`.

**2. A current scout binary.** It is hand-installed at
`~/.docker/cli-plugins/docker-scout` and does not auto-update. v0.15.0 sat there
from 2023 to 2026 and could not export images from Docker 29, failing with
`could not read image: ... blobs/sha256/...: no such file or directory` — which
looks like a disk problem and is not one. The script warns when prod reports v0.x.

```bash
ssh -S ~/.ssh/control-feedsubscription feedsubscription.com "docker scout version"
```

To upgrade (check the latest tag at `docker/scout-cli/releases`):

```bash
ssh -S ~/.ssh/control-feedsubscription feedsubscription.com 'set -e
cd /tmp
V=1.24.0
curl -fsSL -O https://github.com/docker/scout-cli/releases/download/v$V/docker-scout_${V}_linux_amd64.tar.gz
curl -fsSL -O https://github.com/docker/scout-cli/releases/download/v$V/docker-scout_${V}_checksums.txt
grep docker-scout_${V}_linux_amd64.tar.gz docker-scout_${V}_checksums.txt | sha256sum -c -
mkdir -p scout-extract && tar -xzf docker-scout_${V}_linux_amd64.tar.gz -C scout-extract
install -m 0755 scout-extract/docker-scout ~/.docker/cli-plugins/docker-scout
docker scout version
rm -rf scout-extract docker-scout_${V}_*'
```

The asset is named `docker-scout_<version>_checksums.txt`, not `checksums.txt`.

## Scan results

The bundled script handles SSH ControlMaster setup, image discovery from the Makefile,
and running scans in batches of 4 to limit cache contention. Images whose scan
produced no summary are retried once sequentially (reported as `[retry] <image>`
on stderr), which clears the scout index-cache lock conflicts that concurrency
causes:

```!
${CLAUDE_SKILL_DIR}/scripts/scan-images.sh
```

## Workflow

### Step 1: Review scan results above

Each image section shows counts in this format:
```
14 vulnerabilities found in 8 packages
  CRITICAL  0
  HIGH      10
  MEDIUM    1
  LOW       3
```

If an image shows `(no summary — scan failed)`, the last lines of the raw scout
output are printed underneath it — read those first. If they are inconclusive,
re-run that image's scan manually without the filter:
```bash
ssh -S ~/.ssh/control-feedsubscription feedsubscription.com \
  "docker scout cves <image>:latest 2>&1 | tail -30"
```

If *every* image failed, it is an environment problem, not an image problem —
see the Docker Hub login prerequisite above.

### Step 2: Get HIGH/CRITICAL package details

For each image with HIGH or CRITICAL findings, run sequentially (not in parallel):

```bash
ssh -S ~/.ssh/control-feedsubscription feedsubscription.com \
  "docker scout cves <image>:latest --only-severity high,critical --format only-packages 2>&1 | grep -E '│.*[1-9][CH]|✗|vulnerable'"
```

To get specific CVE IDs and fix versions for flagged packages:

```bash
ssh -S ~/.ssh/control-feedsubscription feedsubscription.com \
  "docker scout cves <image>:latest 2>&1 | grep -B2 -A8 '✗ HIGH\|✗ CRITICAL' | grep -E '✗|CVE|Fixed version' | head -40"
```

### Step 3: Categorize vulnerabilities

For each vulnerable package, determine the category:

**Fixable**: Has a "Fixed version" in Scout output — act on these.

**npm-bundled (Node.js images)**: tar, glob, minimatch appearing in Node.js images
are npm's own internal modules, not app code. Verify:
```bash
ssh -S ~/.ssh/control-feedsubscription feedsubscription.com \
  "docker run --rm <image>:latest sh -c 'ls node_modules/tar node_modules/glob 2>/dev/null || echo \"not in app\"'"
# Then check npm internals:
ssh -S ~/.ssh/control-feedsubscription feedsubscription.com \
  "docker run --rm <image>:latest sh -c 'find /usr/local/lib/node_modules/npm -name \"package.json\" -path \"*/tar/package.json\" | head -3'"
```
If found only in `/usr/local/lib/node_modules/npm/`, these are npm internals —
exploitable only during `npm install`, not at runtime. **No action needed.**

**Alpine pin staleness**: After bumping one Alpine package pin, `apk upgrade` may
have already moved other pinned packages to newer versions, making those pins
stale downgrades. If a build fails with `ERROR: unable to select packages`, check
which packages `apk upgrade` upgraded:
```bash
ssh -S ~/.ssh/control-feedsubscription feedsubscription.com \
  "docker run --rm <base-image> sh -c 'apk update -q && apk upgrade --simulate 2>&1'"
```
Update any stale pins to match.

**Build-stage only (multi-stage Dockerfiles)**: Packages in build stages that
aren't copied to the final image. Verify by running a container and checking:
```bash
ssh -S ~/.ssh/control-feedsubscription feedsubscription.com \
  "docker run --rm <image>:latest sh -c 'apk info | grep <package>'"
```

**No fix available**: Scout shows "Fixed version: not fixed" — document and monitor.

### Step 4: Assess runtime impact before fixing

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

### Step 5: Generate report

Create `docker-scan-YYYY-MM-DD.md` with today's date, in the repo root.

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

### Step 6: Compare with previous scan (optional)

Look for the most recent previous report. Reports were named `image-check-*.md`
before 2026-08-08, so match both, and check `.tmp/` — the one pre-2026-08-08
report that survives sits there and is gitignored:
```bash
ls -1t docker-scan-*.md image-check-*.md .tmp/image-check-*.md 2>/dev/null | head -5
```

Identify new CVEs, fixed CVEs, and count changes since last scan.

## Common fix patterns

**Before committing any fix, always build the image locally to verify it
succeeds.** Use the Makefile target for the affected image, e.g.:

```bash
make app        # or: make certbot, make logger, etc.
```

If the build fails, diagnose before committing — don't push broken Dockerfiles.

**Group commits by image.** One commit per image, not one commit for all fixes.
This keeps history bisectable and makes rollbacks scoped to a single image.

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

After building, verify there are no critical dependency conflicts:
```bash
docker run --rm <image>:latest python -c "import <package>; print('ok')"
```

For certbot specifically, also verify pyopenssl compatibility:
```bash
docker run --rm <image>:latest python -c "import certbot; import OpenSSL; print('ok')"
```

### Debian/Ubuntu base packages (boky/postfix, Ubuntu resolver)

```dockerfile
RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*
```

## Troubleshooting

**SSH connection not established**:
```bash
ssh -M -S ~/.ssh/control-feedsubscription -o ControlPersist=10m -fN feedsubscription.com
```

**All scans fail with `please login`**: prod has no Docker Hub credentials — see
the prerequisites section above.

**Scans fail with `could not read image: ... no such file or directory`**: prod's
scout binary is too old for the running Docker daemon. Not a disk-space problem.
Upgrade it — see the prerequisites section above.

**Editing `scan-images.sh`**: it runs under macOS `/bin/bash`, which is 3.2. No
associative arrays (`declare -A`), and never use `(( i++ ))` as a statement — it
returns 1 when `i` is 0 and `set -e` aborts the run. Syntax-check with
`/bin/bash -n scripts/scan-images.sh`.

**Cache conflict / empty output from background scan**:
`failed to index image: failed to initialize cache: cache may be in use by
another process` means concurrent scans fought over scout's single-writer index
cache. The script already retries those sequentially; if a retry also fails,
lower `BATCH_SIZE` in `scripts/scan-images.sh`.

**`grep "vulnerabilities │"` produces no output**:
Scout's output format does not use `│` in the summary line. Use instead:
```bash
ssh -S ~/.ssh/control-feedsubscription feedsubscription.com \
  "docker scout cves <image>:latest 2>&1 | grep -E 'vulnerabilities found|^  CRITICAL|^  HIGH|^  MEDIUM|^  LOW' | tail -5"
```

**`unable to select packages` build error after pin update**:
`apk upgrade` ran first and upgraded that package past the pinned version.
Check what version is now current and update the pin:
```bash
ssh -S ~/.ssh/control-feedsubscription feedsubscription.com \
  "docker run --rm <base-image> sh -c 'apk update -q 2>/dev/null; apk info <package> | head -1'"
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

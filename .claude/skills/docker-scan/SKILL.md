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

Scan all images and generate a report:

1. Find all Docker images:
```bash
cd docker-services/
for dir in */; do echo "${dir%/}"; done
```

2. Run Docker Scout on each image:
```bash
docker scout cves <image>:latest 2>&1
```

3. Generate report in `image-check-YYYY-MM-DD.md`

## Workflow

### Step 1: Discover images

Find images by scanning the `docker-services/` directory for Dockerfiles:

```bash
cd docker-services/
ls -d */ | sed 's#/##'
```

Verify images exist:
```bash
docker images <image-name> --format "{{.Repository}}:{{.Tag}}"
```

If images don't exist, ask the user if they want to build them first.

### Step 2: Scan for vulnerabilities

For each image, get vulnerability counts:

```bash
docker scout cves <image>:latest 2>&1 | grep "vulnerabilities │"
```

Output format: `│    0C     2H     5M    39L`
- C = Critical, H = High, M = Medium, L = Low

Get detailed HIGH/CRITICAL packages:

```bash
docker scout cves <image>:latest --only-severity high,critical --format only-packages 2>&1
```

### Step 3: Categorize vulnerabilities

For each vulnerable package, determine:

**Fixable**: Has a "Fixed version" specified
```bash
# Look for "Fixed version: X.Y.Z" in output
docker scout cves <image>:latest 2>&1 | grep -A 10 "✗ HIGH"
```

**Base image issue**: Same package appears multiple times with different versions
- Example: `urllib3 2.6.2` (base layer) and `urllib3 2.6.3` (our layer)
- Note: Production uses newer version, but Scout shows old base layers

**Build-stage only**: Package is a devDependency (npm) or only in build stage
- Check `package.json` devDependencies section
- Note these don't affect production runtime

### Step 4: Generate report

Create `image-check-YYYY-MM-DD.md` with:

**Summary table**:
```markdown
| Image | Critical | High | Medium | Low | Status |
|-------|----------|------|--------|-----|--------|
| ...   | ...      | ...  | ...    | ... | ...    |
```

**HIGH severity details** (grouped by image):
- Package name and version
- CVE identifier
- Fixed version (if available)
- Package type (apk, pypi, npm, deb)

**Categorization**:
- ✅ Fixable: List with fix suggestions
- ⚠️ Base image layers: Explain why Scout reports but production is safe
- ℹ️ Build-stage only: Explain these don't affect runtime
- ❌ Unfixable: No fix available yet

**Fix suggestions** (if any fixable vulnerabilities found):
- Alpine packages: `'package-name>=version'` or `'package-name=version'`
- Python packages: `'package>=version'`
- npm packages: Add to `package.json` overrides section

### Step 5: Compare with previous scan (optional)

If user provides `--compare <file>`, read the previous report and identify:
- New CVEs since last scan
- Fixed CVEs since last scan
- Changes in vulnerability counts

## Common fix patterns

### Alpine package pins

Add to Dockerfile:
```dockerfile
RUN apk add --no-cache --upgrade 'package-name=X.Y.Z-rN'
```

### Python package upgrades

Add to Dockerfile:
```dockerfile
RUN python -m pip install 'package>=X.Y.Z'
```

### npm overrides

Add to `package.json`:
```json
{
  "overrides": {
    "package-name": "^X.Y.Z"
  }
}
```

Then run `npm install` to apply.

## Important notes

**Docker Scout scans all layers**: Docker Scout reports vulnerabilities in all image layers, including base images and build stages. This means:

- **Base image layers**: If a base image has `urllib3 2.6.2` and we install `urllib3 2.6.3`, Scout shows both. The production container uses the newer version, but Scout flags the old base layer.

- **Build stages**: If a package exists in build stages (like npm devDependencies), Scout reports it even though it's not in the final production image.

**When documenting**: Clearly mark these as "base image layer issue" or "build-stage only" so the user understands they're not runtime vulnerabilities.

**Verification**: To verify a package isn't in production, run:
```bash
docker run --rm <image>:latest sh -c 'command to check package'
```

Examples:
```bash
# Check Python package
docker run --rm <image>:latest sh -c 'python -m pip list | grep urllib3'

# Check npm package
docker run --rm <image>:latest sh -c 'ls node_modules/ | grep package-name'

# Check Alpine package
docker run --rm <image>:latest sh -c 'apk info | grep package-name'
```

## Report template

Use this structure for `image-check-YYYY-MM-DD.md`:

```markdown
# Docker Image Security Check

**Date:** YYYY-MM-DD
**Tool:** Docker Scout X.Y.Z

## Summary

| Image | Critical | High | Medium | Low | Status |
|-------|----------|------|--------|-----|--------|

## High Severity Vulnerabilities

### <image-name>

| Package | Version | CVE | Fixable | Fix |
|---------|---------|-----|---------|-----|

## Fixes Applied (if any)

### ✅ Completed
1. Package upgrades...

### ⚠️ Partial/Issues
1. Base image layer issues...

### ❌ Cannot Fix
1. No fix available...

## Recommendations

- Immediate actions
- Short-term monitoring
- Long-term strategy

## Notes

- Base image limitations
- Build-stage vs production clarifications
```

## Troubleshooting

**Docker not running**:
```bash
# Check if Docker is running
docker info >/dev/null 2>&1 || echo "Docker not running"

# Start Docker on macOS
open -a Docker
```

**Images not found**:
```bash
# List all images
docker images

# Check specific image
docker images <image-name>:latest
```

**Scout output too large**:
Use `--only-severity high,critical` to focus on important issues:
```bash
docker scout cves <image>:latest --only-severity high,critical
```

## Best practices

1. **Scan regularly**: Every 4 weeks is a good cadence
2. **Compare scans**: Use previous reports to track progress
3. **Focus on fixable**: Prioritize vulnerabilities with available fixes
4. **Document unfixable**: Track issues awaiting upstream patches
5. **Verify in production**: Check that reported vulnerabilities actually exist in runtime

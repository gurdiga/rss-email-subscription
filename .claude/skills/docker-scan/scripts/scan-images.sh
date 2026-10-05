#!/bin/bash
# Scans all production Docker images for HIGH/CRITICAL vulnerabilities with
# docker scout. Runs up to 4 scans concurrently, retries any that produced no
# summary, and prints a per-image block.
#
# Usage: scan-images.sh [prod|local]
#   prod  (default) scan the images on feedsubscription.com — the authoritative
#         target, since images are built there and some upgrade system packages
#         at build time
#   local scan images in the local Docker daemon; results do NOT reflect prod,
#         so use it only to exercise this script or when prod is unreachable
#
# Must stay bash 3.2 compatible: macOS /bin/bash is 3.2 and the skill runner
# invokes this script through it. No associative arrays, no ((i++)) as a
# statement (returns 1 when i is 0, which set -e turns into an abort).
set -euo pipefail

TARGET=${1:-prod}
SSH_SOCKET=~/.ssh/control-feedsubscription
SSH="ssh -S $SSH_SOCKET feedsubscription.com"
BATCH_SIZE=4

# Seconds one scan may run on prod before it is killed. On 2026-10-04 three
# concurrent scans sat for 13 minutes on a 1 GB box, filled swap, and took the
# site down until a reboot; nothing was going to stop them.
SCAN_TIMEOUT=${SCAN_TIMEOUT:-300}

# Defined up front because bash resolves function names at call time, so these
# cannot follow the loops that use them.

# Keeps the whole scout output alongside the summary: when scout errors out
# (expired Docker Hub login, cache lock) the summary grep matches nothing, and
# without the raw text that is indistinguishable from a clean image.
scan_to() {
  local image=$1
  local output_path_prefix=$2
  local status=0

  scan_image "$image" > "$output_path_prefix.raw" 2>&1 || status=$?

  # 124 is timeout's own exit code; 137 means it had to follow up with KILL.
  if (( status == 124 || status == 137 )); then
    echo "[timeout] scan of $image killed after ${SCAN_TIMEOUT}s" >> "$output_path_prefix.raw"
  fi

  grep -E 'vulnerabilities found|^  CRITICAL|^  HIGH|^  MEDIUM|^  LOW' \
    "$output_path_prefix.raw" | tail -5 > "$output_path_prefix.summary" || true
}

scan_image() {
  local image=$1

  if [[ $TARGET == local ]]; then
    docker scout cves "$image:latest"
  else
    # The timeout runs on prod, not around the local ssh: cutting the ssh
    # session leaves the remote scan running. timeout signals its whole process
    # group, which is what reaches the docker-scout plugin, a child of the
    # docker CLI.
    $SSH "timeout --kill-after=10 $SCAN_TIMEOUT docker scout cves $image:latest"
  fi
}

# Called before every batch and every retry, not only at startup: when the
# master is gone, ssh -S does not fail, it quietly opens a new connection per
# command. Prod's ufw refuses a source that opens 6 connections to port 22 in
# 30 seconds, so a batch without a master can lock this machine out, as
# happened on 2026-10-03.
ensure_master() {
  [[ $TARGET == prod ]] || return 0

  if ssh -S "$SSH_SOCKET" -O check feedsubscription.com 2>/dev/null; then
    return 0
  fi

  echo "[ssh] Establishing ControlMaster..." >&2

  # A dead master leaves its socket file behind, and ssh -M then gives up on
  # multiplexing instead of replacing it.
  rm -f "$SSH_SOCKET"
  ssh -M -S "$SSH_SOCKET" -o ControlPersist=10m -fN feedsubscription.com
}

if [[ $TARGET != prod && $TARGET != local ]]; then
  echo "usage: $(basename "$0") [prod|local]" >&2
  exit 2
fi

ensure_master

# Prod's scout is a hand-installed binary, so it drifts. v0.15.0 sat there from
# 2023 until 2026 and failed against Docker 29 with an unreadable blob error
# rather than anything naming the real cause. Warn on a major version behind.
if [[ $TARGET == prod ]]; then
  prod_scout=$($SSH "docker scout version 2>/dev/null" | sed -n 's/^version: v\([0-9]*\).*/\1/p')
  if [[ -n $prod_scout ]] && (( prod_scout < 1 )); then
    echo "[warn] prod docker scout is v0.x — too old for Docker 29+. Reinstall from" >&2
    echo "       https://github.com/docker/scout-cli/releases into ~/.docker/cli-plugins/" >&2
  fi
fi

# Get image list from Makefile (space-separated after "all-images:")
images=$(grep "^all-images:" Makefile | sed 's/^all-images:[[:space:]]*//')
read -ra image_list <<< "$images"

echo "Images to scan ($TARGET): ${image_list[*]}" >&2
echo ""

# Each scan writes to outdir/<index>.{raw,summary}, keyed by position in image_list.
outdir=$(mktemp -d "${TMPDIR:-/tmp}/docker-scan.XXXXXX")
trap 'rm -rf "$outdir"' EXIT

# Run scans in batches of BATCH_SIZE
i=0
for image in "${image_list[@]}"; do
  if (( i % BATCH_SIZE == 0 )); then
    ensure_master
  fi

  scan_to "$image" "$outdir/$i" &
  i=$((i + 1))

  if (( i % BATCH_SIZE == 0 )); then
    wait || true
  fi
done

# Wait for remaining
wait || true

# Scout's image-index cache is single-writer, so concurrent scans can lose the
# lock and abort. Give the losers one sequential retry before calling them failed.
i=0
for image in "${image_list[@]}"; do
  if [[ ! -s "$outdir/$i.summary" ]]; then
    echo "[retry] $image" >&2
    ensure_master
    scan_to "$image" "$outdir/$i"
  fi
  i=$((i + 1))
done

# Output results
i=0
failed=0
for image in "${image_list[@]}"; do
  echo "### $image"
  if [[ -s "$outdir/$i.summary" ]]; then
    cat "$outdir/$i.summary"
  else
    failed=$((failed + 1))
    echo "(no summary — scan failed; last lines of raw output:)"
    tail -3 "$outdir/$i.raw" | sed 's/^/    /'
  fi
  echo ""
  i=$((i + 1))
done

# Every image failing points at the environment, not at the images. Report it on
# stdout and still exit 0: this runs as a SKILL.md `!` block, and a nonzero exit
# makes the harness abort the skill load, so the diagnosis below would never
# reach the reader.
if (( failed == ${#image_list[@]} )); then
  echo "ALL ${failed} SCANS FAILED — do not report these as clean images."
  echo "If the raw output says 'please login', run 'docker login' on the $TARGET host:"
  echo "docker scout queries Docker Hub and needs credentials there."
fi

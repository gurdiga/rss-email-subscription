#!/bin/bash
# Scans all production Docker images for HIGH/CRITICAL vulnerabilities via SSH.
# Runs up to 4 scans concurrently. Outputs a structured summary for each image.
set -euo pipefail

SSH_SOCKET=~/.ssh/control-feedsubscription
SSH="ssh -S $SSH_SOCKET feedsubscription.com"
BATCH_SIZE=4

# Establish ControlMaster if not already active
if ! ssh -S "$SSH_SOCKET" -O check feedsubscription.com 2>/dev/null; then
  echo "[ssh] Establishing ControlMaster..." >&2
  ssh -M -S "$SSH_SOCKET" -o ControlPersist=10m -fN feedsubscription.com
fi

# Get image list from Makefile (space-separated after "all-images:")
images=$(grep "^all-images:" Makefile | sed 's/^all-images:[[:space:]]*//')
read -ra image_list <<< "$images"

echo "Images to scan: ${image_list[*]}" >&2
echo ""

declare -A pids
declare -A tmpfiles

# Run scans in batches of BATCH_SIZE
i=0
for image in "${image_list[@]}"; do
  tmpfile=$(mktemp)
  tmpfiles[$image]=$tmpfile

  (
    $SSH "docker scout cves ${image}:latest 2>&1 | \
      grep -E 'vulnerabilities found|^  CRITICAL|^  HIGH|^  MEDIUM|^  LOW' | \
      tail -5" > "$tmpfile" 2>&1
  ) &
  pids[$image]=$!
  (( i++ ))

  if (( i % BATCH_SIZE == 0 )); then
    for img in "${!pids[@]}"; do
      wait "${pids[$img]}" 2>/dev/null || true
      unset "pids[$img]"
    done
  fi
done

# Wait for remaining
for img in "${!pids[@]}"; do
  wait "${pids[$img]}" 2>/dev/null || true
done

# Output results
for image in "${image_list[@]}"; do
  tmpfile=${tmpfiles[$image]}
  echo "### $image"
  if [[ -s "$tmpfile" ]]; then
    cat "$tmpfile"
  else
    echo "(no output — scan may have failed or produced no findings)"
  fi
  echo ""
  rm -f "$tmpfile"
done
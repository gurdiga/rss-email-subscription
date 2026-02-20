#!/usr/bin/env bash
set -euo pipefail

DOMAIN="feedsubscription.com"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG="$SCRIPT_DIR/$DOMAIN.txt"

command -v doctl >/dev/null 2>&1 || { echo >&2 "doctl not found"; exit 1; }
command -v jq    >/dev/null 2>&1 || { echo >&2 "jq not found";    exit 1; }
[[ -f "$CONFIG" ]] || { echo >&2 "Config not found: $CONFIG"; exit 1; }

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

CURRENT_FILE="$WORK_DIR/current"      # ID|TYPE|NAME|TTL|PRI|DATA
CURRENT_KEYS="$WORK_DIR/current-keys" # TYPE|NAME|TTL|PRI|DATA (sorted)
DESIRED_KEYS="$WORK_DIR/desired-keys" # TYPE|NAME|TTL|PRI|DATA (sorted)

# Fetch current records from DigitalOcean (excluding NS/SOA)
doctl compute domain records list "$DOMAIN" --output json |
  jq -r '
    .[] |
    select(.type != "NS" and .type != "SOA") |
    "\(.id)|\(.type)|\(.name)|\(.ttl)|\(.priority)|\(.data)"
  ' > "$CURRENT_FILE"

# Extract keys (strip ID), sort for comm
awk -F'|' '{ print $2"|"$3"|"$4"|"$5"|"$6 }' "$CURRENT_FILE" | sort > "$CURRENT_KEYS"

# Parse config into sorted keys: TYPE|NAME|TTL|PRI|DATA
# Format: one record per line — TYPE NAME TTL PRIORITY DATA
# DATA is the rest of the line and may contain spaces; # lines are comments.
while IFS= read -r line; do
  [[ "$line" =~ ^[[:space:]]*(#|$) ]] && continue
  read -r type name ttl pri data <<< "$line"
  data="$(sed -E 's/ +#.*//' <<< "$data")"  # strip inline comments (space(s) + #)
  printf '%s|%s|%s|%s|%s\n' "$type" "$name" "$ttl" "$pri" "$data"
done < "$CONFIG" | sort > "$DESIRED_KEYS"

to_add="$(comm -23 "$DESIRED_KEYS" "$CURRENT_KEYS")"
to_delete="$(comm -13 "$DESIRED_KEYS" "$CURRENT_KEYS")"

if [[ -z "$to_add" && -z "$to_delete" ]]; then
  echo "Already up to date."
  exit 0
fi

echo "Pending changes:"
if [[ -n "$to_add" ]]; then
  while IFS= read -r line; do
    echo "  CREATE: $line"
  done <<< "$to_add"
fi
if [[ -n "$to_delete" ]]; then
  while IFS= read -r line; do
    echo "  DELETE: $line"
  done <<< "$to_delete"
fi
echo

read -rp "Apply? [y/N] " confirm
[[ "$confirm" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 1; }

if [[ -n "$to_delete" ]]; then
  while IFS= read -r key; do
    id="$(awk -F'|' -v k="$key" '($2"|"$3"|"$4"|"$5"|"$6) == k { print $1; exit }' "$CURRENT_FILE")"
    if [[ -z "$id" ]]; then
      echo "ERROR: Could not find ID for: $key" >&2
      exit 1
    fi
    doctl compute domain records delete "$DOMAIN" "$id" --force
    echo "Deleted: $key"
  done <<< "$to_delete"
fi

if [[ -n "$to_add" ]]; then
  while IFS='|' read -r type name ttl pri data; do
    args=(compute domain records create "$DOMAIN"
      --record-type "$type"
      --record-name "$name"
      --record-ttl  "$ttl"
      --record-data "$data"
    )
    [[ "$pri" != "0" ]] && args+=(--record-priority "$pri")
    doctl "${args[@]}" > /dev/null
    echo "Created: $type $name $data"
  done <<< "$to_add"
fi

echo "Done."

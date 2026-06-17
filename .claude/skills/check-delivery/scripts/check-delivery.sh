#!/bin/bash
# Checks a feed delivery's health: app-layer sent/ status, Postfix queue
# cross-reference, and a batch-level status tally for that delivery's date.
set -euo pipefail

FEED_ID="${1:-}"
SELECTOR="${2:-}" # deliveryId, or a substring (e.g. a date) to match it

if [[ -z "$FEED_ID" || -z "$SELECTOR" ]]; then
  echo "Usage: $0 <feedId> <deliveryId-or-date>" >&2
  exit 1
fi

DATA_ROOT=".tmp/docker-data/accounts"
LOG_FILE=".tmp/logs/feedsubscription/smtp-out.log"

if [[ ! -d "$DATA_ROOT" || ! -f "$LOG_FILE" ]]; then
  echo "Missing rsynced data. Run: make rsync-data && make rsync-logs" >&2
  exit 1
fi

DELIVERY_DIR=$(find "$DATA_ROOT" -path "*/feeds/$FEED_ID/deliveries/*$SELECTOR*" -type d \
  | grep -vE '/(sent|postfixed)$' | head -1 || true)

if [[ -z "$DELIVERY_DIR" ]]; then
  echo "No delivery found for feed '$FEED_ID' matching '$SELECTOR'" >&2
  exit 1
fi

echo "Delivery: $DELIVERY_DIR"
[[ -f "$DELIVERY_DIR/item.json" ]] && echo "Item: $(grep -m1 '"title"' "$DELIVERY_DIR/item.json")"
echo ""

# --- App-layer check ---
total=0
sent_ok=0
not_sent=()
for f in "$DELIVERY_DIR"/sent/*.json; do
  [[ -e "$f" ]] || continue
  total=$((total + 1))
  if grep -q '"status": "sent"' "$f"; then
    sent_ok=$((sent_ok + 1))
  else
    not_sent+=("$f")
  fi
done

echo "App layer: $sent_ok/$total recipients reached status=sent"
if ((${#not_sent[@]} > 0)); then
  echo "Recipients NOT sent:"
  printf '  %s\n' "${not_sent[@]}"
fi
echo ""

# --- Postfix cross-reference ---
# Only pull the queue ID from "postfixed" records — our own Postfix queue ID.
# The later "sent" record's logMessage is the *receiving* server's final reply,
# which can also contain the phrase "queued as" but with its own ID format
# (e.g. ProtonMail's lowercase-mixed IDs), so it must not be matched here.
queue_ids=$(grep -A2 '"status": "postfixed"' "$DELIVERY_DIR"/sent/*.json \
  | grep -ohE 'queued as [A-Za-z0-9]+' | awk '{print $3}' | sort -u)

if [[ -z "$queue_ids" ]]; then
  echo "No Postfix queue IDs found in delivery records."
else
  qcount=$(echo "$queue_ids" | wc -l | tr -d ' ')
  echo "Postfix cross-check: $qcount queue IDs found"
  bad=0
  while read -r qid; do
    [[ -z "$qid" ]] && continue
    status_line=$(grep "$qid" "$LOG_FILE" | grep 'status=' || true)
    if [[ -z "$status_line" ]]; then
      echo "  $qid: NOT FOUND in smtp-out.log"
      bad=$((bad + 1))
    elif [[ "$status_line" != *"status=sent"* ]]; then
      echo "  $qid: $(grep -oE 'status=[a-z]+' <<<"$status_line" | tail -1)"
      bad=$((bad + 1))
    fi
  done <<<"$queue_ids"
  ((bad == 0)) && echo "  all queue IDs show status=sent"
fi
echo ""

# --- Batch-level tally for the delivery's date ---
if [[ -f "$DELIVERY_DIR/timestamp.json" ]]; then
  date_prefix=$(grep -oE '^"[0-9]{4}-[0-9]{2}-[0-9]{2}' "$DELIVERY_DIR/timestamp.json" | tr -d '"')
  echo "Batch tally for $date_prefix (smtp-out.log):"
  grep "^$date_prefix" "$LOG_FILE" | grep -oE 'status=[a-z]+' | sort | uniq -c
fi

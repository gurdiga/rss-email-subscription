---
name: check-delivery
description: Check the health of an RSS feed's email delivery using rsynced prod data (docker-data + logs). Use when the user asks to check a delivery, verify a feed's emails went out, or investigate bounces/deferrals for a specific date or feed.
---

# Check Delivery

Verifies that a feed delivery's emails actually reached recipients, by cross-checking the app's delivery records against Postfix's outbound log.

## Prerequisites

This skill reads from two directories that must already be rsynced from prod — it does **not** rsync them itself:

- `.tmp/docker-data/` — mirrors prod's docker data volume
- `.tmp/logs/feedsubscription/` — mirrors prod's `/var/log`

If either is missing, run the relevant `make` target to rsync it:

```bash
make rsync-logs   # syncs .tmp/logs/
make rsync-data   # syncs .tmp/docker-data/
```

### Freshness check

Directory mtimes are not reliable here — rsync preserves source mtimes by default, so a folder's own `ls -la` timestamp reflects when prod last wrote to it, not when the rsync ran. To gauge actual data freshness, check the latest *content* timestamp instead and compare it to now:

```bash
tail -1 .tmp/logs/feedsubscription/smtp-out.log
ls -t .tmp/docker-data/accounts/*/feeds/<feedId>/deliveries/ | head -1
```

If the most recent entry is older than expected for that feed's posting cadence, re-run `make rsync-logs` / `make rsync-data` before drawing conclusions, rather than assuming "no recent data" means "no recent activity."

## Layout

```
.tmp/docker-data/accounts/<accountId>/feeds/<feedId>/deliveries/<deliveryId>/
  item.json        # the RSS item delivered: title, content, author, pubDate, link, guid
  timestamp.json    # when the delivery was created
  postfixed/        # can be legitimately empty even on a healthy delivery — not a red flag
  sent/<msgId>.json # one file per recipient: subject, htmlBody, to, logRecords[]
                     # logRecords statuses: prepared -> postfixed -> sent

.tmp/logs/feedsubscription/
  smtp-out.log      # Postfix outbound log — the one relevant here
  api.log, app.log, smtp-in.log, website.log, delmon.log, certbot.log  # not used by this skill
```

## Workflow

Run the bundled script, passing the feed ID and either a delivery ID or a date substring to match it:

```bash
.claude/skills/check-delivery/scripts/check-delivery.sh <feedId> <date-or-deliveryId>
```

It does all of the mechanical work in one pass:

1. Locates the delivery dir (errors out with a hint to rsync if not found).
2. Prints the delivered item's title for context.
3. App-layer check — counts how many `sent/*.json` files reached `"status": "sent"`, and lists any that didn't.
4. Postfix cross-reference — extracts *every* queue ID from the delivery's `postfixed` logRecords (not just one sample), looks each up in `smtp-out.log`, and flags any that are missing or not `status=sent`.
5. Batch-level tally — greps `smtp-out.log` for the delivery's date and tallies all `status=` values, to catch bounces/deferrals elsewhere in the same batch.

## Reporting

Summarize both layers from the script's output: how many of the `sent/` records reached `sent` status, and what the batch tally shows. Flag any mismatch between the two (e.g. app says sent but Postfix shows deferred) as worth a closer look — the judgment call on what a mismatch means is not automated.

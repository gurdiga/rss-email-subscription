# Handoff: put smtp-in's queue on a volume

Written 2026-10-31. Check everything below against the repo before relying on it.

## The problem

smtp-in is the internet-facing MX. Its `/var/spool/postfix` lives in the container layer, so recreating the container, as every deploy of that image does, deletes any mail it has accepted but not yet delivered. A sender that got `250` will not retry, so that mail is lost with no bounce.

smtp-out and postilion do not have this problem: `docker-compose.yml` mounts `./.tmp/postfix-queue` and `./.tmp/postilion-queue` on their spools.

Until this is done, every smtp-in deploy needs a manual drain first, as in the deploy of 2026-10-31.

## The change

Add `./.tmp/smtp-in-queue:/var/spool/postfix` to the smtp-in service in `docker-compose.yml`, matching the other two. The line is small. The work is in the points below.

## Check before doing it

- **A secret lands on the host.** `configure_sasl` in `docker-services/smtp-in/entrypoint.sh` copies `/etc/sasldb2` to `/var/spool/postfix/etc/sasldb2`, and sasldb stores passwords in plaintext. On a volume, that file sits under `.tmp/` on the host. postilion does the same today, so look at how it is handled there. Find out whether `make backup` and `make rsync-data` would pick up the new directory, and exclude it if so.
- **First start on an empty directory.** A bind mount hides the spool layout from the image. Compare with smtp-out and postilion to confirm Postfix builds it itself at start, including ownership and modes. Check that the `postfix` user and `postdrop` group IDs are right for files that outlive a container, since they could change between image builds.
- **Hidden image contents.** The entrypoint writes `resolv.conf`, `hosts` and `nsswitch.conf` into the spool at every start, which is what keeps those current.
- **Stale state after an unclean stop.** Confirm `postfix start-fg` starts cleanly with a leftover `pid/master.pid` on the volume.
- **The switch itself.** The first deploy with the volume starts from an empty directory, so the old container's queue is still lost unless it is drained first. Use the same drain as any smtp-in deploy: `postconf -e 'master_service_disable = inet'`, `postfix reload`, `postqueue -f`, wait until `postqueue -p` is empty, then `make start`.

## Done means

- A held message survives recreation. Queue one on a local stack, `postsuper -h ALL`, recreate the container, confirm it is still there with `postqueue -p`, then `postsuper -H ALL` and watch it deliver.
- smtp-in's healthcheck passes, port 25 accepts mail on prod, and the certificate volumes still work.
- The manual drain is removed from the deploy notes, and `.claude/skills/prod-deploy/SKILL.md` says what it should.

## How to work here safely

- `smtp-in`'s `mynetworks` is loopback-only: sibling containers get external-sender policy, so probe from a non-loopback address or tests pass for the wrong reason.
- Local stacks send real email: use only `@feedsubscription.com` recipients.
- `make smtp-in` only builds; `make start` activates. This change needs only `make start`, plus the host directory.

# Detecting a container being down

Written 2026-08-16, while checking prod after a reboot with the six Docker package upgrades from that morning’s apticron report still pending. The gap was not new — it is why the 2026-08-02 outage went unnoticed — but a `docker-ce` upgrade is the most likely thing to trigger it again, so it was worth having written down before that runs.

Closed the same day by [bin/check-containers](bin/check-containers), described at the end. Everything above that section is the gap as it stood.

## The gap

Every alerting path on prod is a log tailer. The watchers started from cron —

```
@reboot make watch-smtp-out
@reboot make watch-app
@reboot make watch-website
@reboot make watch-delmon
@reboot make watch-msmtp
```

— are all the same shape: a long-lived `tail --follow` over a file under `.tmp/logs/feedsubscription/`, filtered through `grep`, piped into [bin/notify](bin/notify). From [Makefile](Makefile):

```make
watch-smtp-out:
	@tail -n0 --follow=name --retry .tmp/logs/feedsubscription/smtp-out.log |
	grep --line-buffered -E \
			-e '(warning|error|fatal|panic|reject):' \
			-e ' POSTFIX STARTING UP ' \
	...
```

They are edge-triggered on a line *appearing*. A container that fails to start writes no lines, so it raises nothing. Its silence is indistinguishable from a quiet night.

Nothing else filled the hole: `crontab -l` on prod contained no `docker ps`, no container-state check of any kind.

## Why the silence is total

The files being tailed are produced by the very stack that is down. Every service ships its logs to the `logger` container over the syslog driver:

```yaml
x-logging: &logging
  logging:
    driver: syslog
    options:
      syslog-address: tcp://10.5.5.1:514
```

`logger` mounts `./.tmp/logs:/var/log/syslog-ng` and writes the per-container files the watchers read. Confirmed on prod — `10.5.5.1` is `logger` itself, not the bridge, whose gateway is `10.5.5.100`:

```
$ docker network inspect res_net --format '{{range .Containers}}{{.Name}} {{.IPv4Address}}{{println}}{{end}}'
logger 10.5.5.1/24
resolver 10.5.5.2/24
...
```

So when containers die, the log files simply stop growing. The watchers stay alive and healthy, blocked on a `tail` that will never produce another line. Nothing errors, nothing exits, nothing mails.

## The mechanism that produces the dead containers: the logger race

Worth stating because it is what makes the silence likely rather than hypothetical.

`logger` is the only service that does **not** carry the `*logging` anchor — it cannot ship its logs to itself. Everything else needs `logger` already listening on `10.5.5.1:514` before it can emit its first line, and the Docker syslog driver fails *task creation* outright when it cannot connect. Not a degraded start — no container at all.

`docker-compose.yml` does declare the dependency:

```yaml
depends_on:
  logger:
    condition: service_healthy
```

but that is a Compose-level construct. It governs `docker compose up`; it means nothing to the daemon, which on its own start brings up every `restart: always` container in parallel and ignores it. Whoever loses the race to `logger` fails to create a task and lands in `Exited (128)`.

This is why plain reboots are safe and daemon restarts are not: `@reboot make start` goes through Compose, which honors `depends_on`. A `docker-ce` postinst restarting `dockerd` does not.

## What already happened

On 2026-08-02 an `apt-get dist-upgrade` took `docker-ce` from 29.x to 29.7.1. The postinst restarted the daemon and nine of ten containers came back `Exited (128)`:

```
failed to create task for container: failed to initialize logging driver: dial tcp 10.5.5.1:514: connect: connection refused
```

Prod was fully down from 19:47:28 to 19:49:19 UTC — 1m51s — until the containers were started by hand. `restart: always` did not recover them. Nothing alerted; the outage was noticed only because the upgrade happened to be watched at the time.

(These figures come from `CONTAINER_RESILIENCE.md`, which recorded that outage. It was never committed and is no longer in the working tree, so this paragraph is the surviving copy.)

## The nearest existing nets, and how slow they are

- **Daily heartbeat.** `app`, `api`, and `delmon` each log one at `5 5 * * *`, plus one at startup — see [src/shared/logging.ts:98](src/shared/logging.ts#L98) and its three callers. `watch-app` greps `"message":"heartbeat"` and mails it. This is a real dead-man’s switch, but the detector is a human noticing an email that failed to arrive, and the window is up to 24 hours.
- **`delivery-report` and `mailq-report`** at `59 23 * * *`. Same shape: they would show a mail outage, up to a day late.
- **`logger`’s healthcheck** is `nc -z -w1 10.5.5.1 514` — it checks only itself, which is the one container that never has this problem.

## What the check does

[bin/check-containers](bin/check-containers), from cron every five minutes:

```
*/5 * * * * bin/check-containers
```

The whole of it is `comm -23` between `docker compose config --services` and `docker compose ps --services --status running`, both sorted, project pinned to `res`. It runs on the host rather than in a container, because a checker that shares fate with the stack it checks is the ssmtp mistake again — which is what [bin/notify](bin/notify) was written to undo, and why notify is the sink.

It mails only when that answer *changes*, which is what makes the recovery mail fall out of the same mechanism that suppresses repeats. Bad news waits for one confirming sample, so a `docker restart` landing between two polls does not page. That sample is keyed on the healthy-or-not verdict rather than on the missing set: a set that keeps changing — one container flapping while another stays down — would never settle, and the standing failure would never be reported at all.

The original sketch called for a sentinel file so the check stays quiet during intentional downtime. Decided against. The two mails a `make stop` produces, one down and one recovered, are the only routine evidence that the checker is alive — which matters here more than usual, because something edge-triggered on change looks exactly the same whether it is running or not, and a mistyped crontab line would be as silent as the outage it was meant to catch. It also removes the sentinel’s own hazard: every future build target would have had to remember to touch it, and the one that forgot would have made the check lie.

The rest of the script is about not lying in the other direction, since a monitor that fails quietly is worse than none:

- No `set -e`. Everywhere else an early exit is a safe default; here it is indistinguishable from an all-clear, so every step that can fail either alerts or fails towards alerting.
- Compose’s stderr is kept out of the expected list. A warning emitted while *succeeding* would sort in among the service names and read as a permanently missing container.
- A failed `ps` empties the running list rather than leaving a partial one, so a dead daemon reports as everything down.
- `reported` is written only after `bin/notify` returns, because a status filed as reported is never sent again. When delivery fails it records a marker instead, so a stack that recovers before the next poll cannot bury the outage and the recovery both.
- A hand-run does not record delivery at all, since notify prints instead of mailing when stdout is a tty. Otherwise a manual check would swallow the alert the next cron run owed us.
- Every `docker` call is bounded by `timeout --kill-after`, so a wedged API cannot leave one run still hanging when the next starts.

Not covered: `Up (unhealthy)` still counts as running, restart loops are invisible between samples, and a `docker compose run` one-off could mask a dead service of the same name.

### What it does not fix

Detection still leaves the stack down until someone reads the mail, and the trigger is untouched: dockerd still brings up every `restart: always` container in parallel and still loses whoever races `logger`.

A `systemd` unit ordered `After=docker.service` and `PartOf=docker.service`, re-running `make start` on every daemon start, would reconcile that automatically. Considered and not taken: it would be a second ordered pass rather than a fix for the race, it lives in `/etc/systemd/system/` where this repo has no home for host configuration, and its own failures would land in a journal nothing on this box watches. Genuinely closing the race means taking `logger` off the task-creation critical path — a host-side syslog listener instead of a container — which is a much larger change.

Until then the manual workaround still applies: run `apt-get dist-upgrade` attended, follow immediately with `make start`, and confirm with `docker ps -a` that nothing sits in `Exited (128)`. The difference is that forgetting now costs five minutes rather than a night.

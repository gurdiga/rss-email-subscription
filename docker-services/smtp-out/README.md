# smtp-out

Debian-based Postfix + OpenDKIM container for outbound email delivery.

## Ports

| Scope | Port | Notes |
|-------|------|-------|
| Container-internal | 587 | Postfix submission port |
| Host-exposed | 1587 | `127.0.0.1:1587->587/tcp` |

## Dependencies on host configuration

### `/etc/ssmtp/ssmtp.conf`

The host uses `ssmtp` to send cron job notifications (watch-app, watch-smtp-out,
etc.). It must relay through smtp-out:

```
mailhub=localhost:1587
```

If this port ever changes, update both `docker-compose.yml` and this file.

### `.env`

The app connects to smtp-out via the Docker internal network:

```
SMTP_CONNECTION_STRING=smtp://smtp-out:587
```

## Persistent data

- **Queue**: `.tmp/postfix-queue/` — mounted as `/var/spool/postfix` to survive
  container restarts
- **DKIM keys**: `.tmp/opendkim-keys/` — mounted read-only at `/mnt/opendkim-keys`

## Delivery monitoring

`delmon` tails the log file named by its `SMTP_OUT_LOG` env var (set in
`docker-compose.yml`) to track per-message delivery status. The filename is
determined by syslog-ng based on the container name, so if this container is
ever renamed, update `SMTP_OUT_LOG` in `docker-compose.yml` accordingly.

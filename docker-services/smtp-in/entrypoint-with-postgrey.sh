#!/usr/bin/env bash
set -euo pipefail

# Configure defaults (no override planned).
POSTGREY_OPTS="\
--inet=127.0.0.1:10023 \
--delay=300 \
--max-age=35 \
--auto-whitelist-clients=5 \
--pidfile=/var/run/postgrey/postgrey.pid \
--lock-file=/var/run/postgrey/postgrey.lock \
--dbdir=/var/lib/postgrey"

echo "[smtp-in] Starting postgrey with: ${POSTGREY_OPTS}" >&2
# shellcheck disable=SC2086  # Intentional word splitting of option string
postgrey ${POSTGREY_OPTS} &

# Give postgrey a moment to bind, without slowing startup much
sleep 0.5 || true

# Delegate to the original image command if provided by CMD
if [ "$#" -gt 0 ]; then
  exec "$@"
fi

# Fall back to the known SMF entrypoint path
if [ -x /entrypoint.sh ]; then
  exec /entrypoint.sh
fi

echo "[smtp-in] ERROR: Expected /entrypoint.sh from base image not found or not executable." >&2
exit 64

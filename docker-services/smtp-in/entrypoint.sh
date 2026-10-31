#!/usr/bin/env bash
set -euo pipefail

log() { printf '[smtp-in] %s\n' "$*" >&2; }
fail() { log "ERROR: $*"; exit 1; }

DOMAIN="feedsubscription.com"
DRAIN_LIMIT_SECONDS=60

apply_postfix_overrides() {
  local override="/etc/postfix/main.cf.override"
  [ -f "$override" ] || fail "Postfix override file missing at ${override}"

  while IFS= read -r line; do
    [ -n "$line" ] || continue
    case "$line" in \#*) continue;; esac
    postconf -e "$line"
  done <"$override"
}

configure_sasl() {
  local password="${SMTP_IN_SASL_PASSWORD:-}"
  [ -n "$password" ] || fail "SMTP_IN_SASL_PASSWORD is required"

  echo "$password" | saslpasswd2 -p -c -u "$DOMAIN" "catch-all"
  usermod -a -G sasl postfix
  chown root:sasl /etc/sasldb2
  chmod 640 /etc/sasldb2
  cp -f /etc/sasldb2 /var/spool/postfix/etc/sasldb2
  chown root:sasl /var/spool/postfix/etc/sasldb2
  chmod 640 /var/spool/postfix/etc/sasldb2

  postconf -e \
    'smtpd_sasl_auth_enable=yes' \
    'smtpd_sasl_security_options=noanonymous' \
    'smtpd_sasl_local_domain=' \
    'broken_sasl_auth_clients=yes' \
    'smtpd_sasl_type=cyrus' \
    'smtpd_sasl_path=smtpd' \
    'smtpd_tls_auth_only=yes'
}

configure_tls() {
  local cert="/etc/postfix/cert/smtp.cert"
  local key="/etc/postfix/cert/smtp.key"
  if [ -f "$cert" ] && [ -f "$key" ]; then
    postconf -e \
      "smtpd_tls_cert_file=${cert}" \
      "smtpd_tls_key_file=${key}" \
      'smtpd_use_tls=yes'
  else
    fail "TLS cert/key not found at ${cert} / ${key}"
  fi
}

configure_postsrsd() {
  local secret_file="/etc/postsrsd.secret"
  if [ ! -s "$secret_file" ]; then
    [ -n "${POSTSRSD_SECRET:-}" ] || fail "POSTSRSD_SECRET is required for postsrsd secret"
    echo "$POSTSRSD_SECRET" >"$secret_file"
    chmod 600 "$secret_file"
  fi

  postsrsd -d"$DOMAIN" -s"$secret_file" &
  sleep 0.2 # brief wait to let postsrsd bind sockets
}

# The queue isn’t on a volume, so recreating the container deletes it. This
# shell stays PID 1 to take docker stop’s SIGTERM, which would otherwise go to
# master, and drains first. stop_grace_period in docker-compose.yml has to
# outlast DRAIN_LIMIT_SECONDS plus the few seconds of postfix stop.
run_postfix() {
  trap drain_and_stop TERM
  postfix start-fg &
  local master=$!

  # The trap interrupts the first wait, and master is still stopping then.
  wait "$master" || true
  wait "$master" || true
}

drain_and_stop() {
  log "Stopping: closing port 25 and draining"
  postconf -e 'master_service_disable = inet'
  postfix reload
  postqueue -f

  for _ in $(seq 1 "$DRAIN_LIMIT_SECONDS"); do
    queue_is_empty && break
    sleep 1
  done

  # Mail held back by a Gmail rate limit won’t drain, and that must not block
  # a deploy, so it’s left to go with the container. This names what was lost.
  if ! queue_is_empty; then
    log "Stopping with mail still queued:"
    postqueue -p >&2
  fi

  postfix stop
}

queue_is_empty() {
  [[ "$(postqueue -p)" == *"queue is empty"* ]]
}

main() {
  apply_postfix_overrides
  # A drain writes this to main.cf, which survives docker restart, and port 25
  # would come back closed.
  postconf -e 'master_service_disable ='
  install -d /var/spool/postfix/etc/postfix/sasl
  cp -f /etc/resolv.conf /var/spool/postfix/etc/resolv.conf
  cp -f /etc/hosts /var/spool/postfix/etc/hosts
  cp -f /etc/nsswitch.conf /var/spool/postfix/etc/nsswitch.conf
  # Chrooted smtpd reads the SASL config from inside the chroot; without
  # this copy mech_list is ignored and all mechanisms get advertised.
  cp -f /etc/postfix/sasl/smtpd.conf /var/spool/postfix/etc/postfix/sasl/smtpd.conf

  configure_sasl
  configure_tls

  configure_postsrsd

  log "Starting postfix"
  run_postfix
}

main "$@"

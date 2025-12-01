#!/usr/bin/env bash
set -euo pipefail

log() { printf '[smtp-in] %s\n' "$*" >&2; }
fail() { log "ERROR: $*"; exit 1; }

DOMAIN="feedsubscription.com"

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

  postconf -e \
    'smtpd_sasl_auth_enable=yes' \
    'smtpd_sasl_security_options=noanonymous' \
    "smtpd_sasl_local_domain=${DOMAIN}" \
    'broken_sasl_auth_clients=yes' \
    'smtpd_sasl_type=cyrus' \
    'smtpd_sasl_path=smtpd'
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

configure_opendkim() {
  local key_dir="/var/db/dkim/${DOMAIN}"
  local key="${key_dir}/default.private"
  [ -f "$key" ] || fail "DKIM key not found for ${DOMAIN} at ${key}"

  sed -i 's/^Socket[[:space:]].*/Socket                  inet:8891@127.0.0.1/' /etc/opendkim.conf
  chown -R opendkim:opendkim "$key_dir"
  chmod 600 "$key"

  opendkim -x /etc/opendkim.conf
  sleep 0.5 # small buffer to let opendkim bind the milter socket

  postconf -e \
    'milter_default_action=accept' \
    'milter_protocol=6' \
    'smtpd_milters=inet:127.0.0.1:8891' \
    'non_smtpd_milters=inet:127.0.0.1:8891'
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

start_postgrey() {
  local opts=(
    "--inet=127.0.0.1:10023"
    "--delay=300"
    "--max-age=35"
    "--auto-whitelist-clients=5"
    "--pidfile=/var/run/postgrey/postgrey.pid"
    "--dbdir=/var/lib/postgrey"
  )
  log "Starting postgrey ${opts[*]}"
  postgrey "${opts[@]}" &
  sleep 0.2 # brief wait to let postgrey bind socket
}

main() {
  apply_postfix_overrides
  install -d /var/spool/postfix/etc
  cp -f /etc/resolv.conf /var/spool/postfix/etc/resolv.conf
  cp -f /etc/hosts /var/spool/postfix/etc/hosts
  cp -f /etc/nsswitch.conf /var/spool/postfix/etc/nsswitch.conf

  configure_sasl
  configure_tls

  start_postgrey
  configure_postsrsd
  configure_opendkim
  configure_opendkim

  log "Starting postfix in foreground"
  exec postfix start-fg
}

main "$@"

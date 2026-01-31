#!/usr/bin/env bash
set -euo pipefail

log() { printf '[smtp-out] %s\n' "$*" >&2; }
fail() { log "ERROR: $*"; exit 1; }

DOMAIN="${POSTFIX_myhostname:-feedsubscription.com}"

apply_postfix_overrides() {
  local override="/etc/postfix/main.cf.override"
  [ -f "$override" ] || fail "main.cf.override not found at ${override}"

  log "Applying main.cf.override"
  cat "$override" >> /etc/postfix/main.cf
}

configure_tls() {
  local cert="/etc/postfix/cert/smtp.cert"
  local key="/etc/postfix/cert/smtp.key"
  [ -f "$cert" ] || fail "TLS cert not found at ${cert}"
  [ -f "$key" ] || fail "TLS key not found at ${key}"

  log "Configuring TLS with ${cert}"
  postconf -e \
    "smtpd_tls_cert_file=${cert}" \
    "smtpd_tls_key_file=${key}" \
    'smtpd_use_tls=no'
}

configure_opendkim() {
  # IMPORTANT: Keys are mounted as flat files, not in subdirectories
  # Mount layout: /etc/opendkim/keys/feedsubscription.com.private
  local key="/etc/opendkim/keys/${DOMAIN}.private"
  [ -f "$key" ] || fail "DKIM key not found for ${DOMAIN} at ${key}"

  chown opendkim:opendkim "$key"
  chmod 600 "$key"

  log "Starting opendkim"
  opendkim -x /etc/opendkim/opendkim.conf
  sleep 0.5 # small buffer to let opendkim bind the milter socket

  postconf -e \
    'milter_default_action=accept' \
    'milter_protocol=6' \
    'smtpd_milters=inet:127.0.0.1:8891' \
    'non_smtpd_milters=inet:127.0.0.1:8891'
}

main() {
  # Add app hostname mapping for better log readability
  # NOTE: This only affects /etc/hosts lookups, not PTR reverse DNS
  echo "10.5.5.100 app" >> /etc/hosts

  # Copy system files needed by postfix chroot
  mkdir -p /var/spool/postfix/etc
  cp -f /etc/resolv.conf /var/spool/postfix/etc/resolv.conf
  cp -f /etc/hosts /var/spool/postfix/etc/hosts
  cp -f /etc/nsswitch.conf /var/spool/postfix/etc/nsswitch.conf

  # Apply main.cf.override
  apply_postfix_overrides

  # configure_tls  # Disabled: not needed for internal relay
  configure_opendkim

  log "Starting postfix in foreground"
  exec postfix start-fg
}

main "$@"

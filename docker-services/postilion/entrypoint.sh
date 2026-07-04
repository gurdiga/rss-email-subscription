#!/usr/bin/env bash
set -euo pipefail

log() { printf '[postilion] %s\n' "$*" >&2; }
fail() { log "ERROR: $*"; exit 1; }

SASL_DOMAIN="gurdiga.com"
SASL_USER="gurdiga"

apply_postfix_overrides() {
  local override="/etc/postfix/main.cf.override"
  [ -f "$override" ] || fail "Postfix override file missing at ${override}"

  while IFS= read -r line; do
    [ -n "$line" ] || continue
    case "$line" in \#*) continue;; esac
    postconf -e "$line"
  done <"$override"
}

configure_master() {
  # Submission-only service: authenticated clients on 587; no port-25
  # listener (inbound MX traffic is smtp-in’s job).
  postconf -M# smtp/inet
  postconf -M "submission/inet=submission inet n - y - - smtpd"
}

configure_sasl() {
  local password="${POSTILION_SASL_PASSWORD:-}"
  [ -n "$password" ] || fail "POSTILION_SASL_PASSWORD is required"

  echo "$password" | saslpasswd2 -p -c -u "$SASL_DOMAIN" "$SASL_USER"
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
  local source_dir="/mnt/opendkim-keys"
  local key_table="/etc/opendkim/KeyTable"
  local dest_dir="/etc/opendkim/keys"

  mkdir -p "$dest_dir"

  # Install a key for every domain listed in KeyTable, so that adding a
  # domain is a config-only change. KeyTable line format:
  #   mail._domainkey.example.com example.com:mail:/etc/opendkim/keys/example.com.private
  local spec domain key
  while read -r _ spec; do
    [ -n "$spec" ] || continue
    domain="${spec%%:*}"
    key="${spec##*:}"
    [ -f "${source_dir}/${domain}.private" ] || fail "DKIM key not found at ${source_dir}/${domain}.private"
    log "Installing DKIM key for ${domain}"
    cp "${source_dir}/${domain}.private" "$key"
    chown opendkim:opendkim "$key"
    chmod 600 "$key"
  done < <(grep -Ev '^\s*(#|$)' "$key_table")

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
  apply_postfix_overrides
  configure_master

  install -d /var/spool/postfix/etc/postfix/sasl
  cp -f /etc/resolv.conf /var/spool/postfix/etc/resolv.conf
  cp -f /etc/hosts /var/spool/postfix/etc/hosts
  cp -f /etc/nsswitch.conf /var/spool/postfix/etc/nsswitch.conf
  # Chrooted smtpd reads the SASL config from inside the chroot; without
  # this copy mech_list is ignored and all mechanisms get advertised.
  cp -f /etc/postfix/sasl/smtpd.conf /var/spool/postfix/etc/postfix/sasl/smtpd.conf

  configure_sasl
  configure_tls
  configure_opendkim

  log "Starting postfix in foreground"
  exec postfix start-fg
}

main "$@"

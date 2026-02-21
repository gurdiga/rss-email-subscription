#!/usr/bin/env bash
set -euo pipefail

log() { printf '[smtp-out] %s\n' "$*" >&2; }
fail() { log "ERROR: $*"; exit 1; }

DOMAIN="${POSTFIX_myhostname:-feedsubscription.com}"

apply_postfix_config() {
  log "Applying Postfix configuration"

  postconf -e \
    "myhostname=feedsubscription.com" \
    "mydestination=localhost" \
    "maillog_file=/dev/stdout" \
    "smtp_address_preference=ipv4" \
    "mynetworks=127.0.0.0/8,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16" \
    "notify_classes=bounce,resource,software" \
    "message_size_limit=10485760" \
    "virtual_alias_domains=feedsubscription.com" \
    "virtual_alias_maps=texthash:/etc/postfix/virtual" \
    "transport_maps=texthash:/etc/postfix/transport" \
    "smtpd_tls_security_level=none" \
    "smtp_tls_security_level=may"
}

configure_opendkim() {
  local source_dir="/mnt/opendkim-keys"
  local dest_dir="/etc/opendkim/keys"
  local key="${dest_dir}/${DOMAIN}.private"

  [ -f "${source_dir}/${DOMAIN}.private" ] || fail "DKIM key not found at ${source_dir}/${DOMAIN}.private"

  mkdir -p "${dest_dir}"
  log "Copying DKIM keys from ${source_dir} to ${dest_dir}"
  cp "${source_dir}/${DOMAIN}.private" "${dest_dir}/"

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

  apply_postfix_config
  configure_opendkim

  log "Starting postfix in foreground"
  exec postfix start-fg
}

main "$@"

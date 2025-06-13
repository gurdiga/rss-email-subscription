#!/bin/sh

set -e

echo "Setting up logrotate cron job..."
echo "0 0 * * * /usr/sbin/logrotate /etc/logrotate.d/feedsubscription.conf" >/etc/crontabs/root

mkdir -p /var/log/syslog-ng

echo "Starting crond..."
/usr/sbin/crond -L /var/log/syslog-ng/logger-cron.log

echo "Starting syslog-ng..."
exec /usr/sbin/syslog-ng --verbose --foreground

#!/bin/sh

set -e

mkdir -p /var/log/syslog-ng

echo "Starting crond..."
/usr/sbin/crond -L /var/log/syslog-ng/logger-cron.log

echo "Starting syslog-ng..."
exec /usr/sbin/syslog-ng --verbose --foreground

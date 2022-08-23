#!/bin/sh

/usr/sbin/crond -L /var/log/syslog-ng/logger-cron.log

exec /usr/sbin/syslog-ng --verbose --foreground

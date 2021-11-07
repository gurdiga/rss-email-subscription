FROM alpine:3.14

VOLUME "/var/log/syslog-ng"
EXPOSE 514/udp 601/tcp 6514/tcp

RUN apk add --no-cache \
  syslog-ng=3.30.1-r1 \
  logrotate=3.18.1-r0 \
  tini=0.19.0-r0

COPY syslog-ng.conf /etc/syslog-ng/syslog-ng.conf
COPY logrotate.conf /etc/logrotate.d/feedsubscription.conf

ENTRYPOINT [ "tini", "--" ]

CMD [ "/bin/sh", "-c", "exec /usr/sbin/syslog-ng --verbose --foreground" ]

FROM alpine:3.16.3

VOLUME "/var/log/syslog-ng"
EXPOSE 514/udp 601/tcp 6514/tcp

RUN apk add --no-cache \
  syslog-ng=3.36.1-r0 \
  logrotate=3.19.0-r3 \
  tini=0.19.0-r0

COPY syslog-ng.conf /etc/syslog-ng/syslog-ng.conf
COPY logrotate.conf /etc/logrotate.d/feedsubscription.conf
COPY start.sh /start.sh

ENTRYPOINT [ "tini", "--" ]

CMD [ "/start.sh" ]

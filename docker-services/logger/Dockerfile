FROM alpine:3.17.2

VOLUME "/var/log/syslog-ng"
EXPOSE 514/udp 601/tcp 6514/tcp

RUN apk add --no-cache \
  syslog-ng=3.38.1-r0 \
  logrotate=3.20.1-r3 \
  tini=0.19.0-r1

COPY syslog-ng.conf /etc/syslog-ng/syslog-ng.conf
COPY logrotate.conf /etc/logrotate.d/feedsubscription.conf
COPY start.sh /start.sh

ENTRYPOINT [ "tini", "--" ]

CMD [ "/start.sh" ]

FROM alpine:3.19.1

VOLUME "/var/log/syslog-ng"
EXPOSE 514/udp 601/tcp 6514/tcp

RUN apk update && apk upgrade --no-cache

RUN apk add --no-cache \
  syslog-ng=4.5.0-r0 \
  logrotate=3.21.0-r1 \
  tini=0.19.0-r2

COPY syslog-ng.conf /etc/syslog-ng/syslog-ng.conf
COPY logrotate.conf /etc/logrotate.d/feedsubscription.conf
COPY start.sh /start.sh

ENTRYPOINT [ "tini", "--" ]

CMD [ "/start.sh" ]

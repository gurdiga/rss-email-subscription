FROM alpine:3.20.2

VOLUME "/var/log/syslog-ng"
EXPOSE 514/udp 601/tcp 6514/tcp

RUN apk update && apk upgrade --no-cache

RUN apk add --no-cache \
  openssl=3.3.1-r3 \
  syslog-ng=4.7.1-r1 \
  logrotate=3.21.0-r1 \
  tini=0.19.0-r3

COPY syslog-ng.conf /etc/syslog-ng/syslog-ng.conf
COPY logrotate.conf /etc/logrotate.d/feedsubscription.conf
COPY start.sh /start.sh

ENTRYPOINT [ "tini", "--" ]

CMD [ "/start.sh" ]

FROM alpine:3.21.3

VOLUME /var/log/syslog-ng
EXPOSE 514/udp 601/tcp 6514/tcp

RUN apk update --no-cache && apk upgrade --no-cache

RUN apk add --no-cache \
  c-ares=1.34.5-r0 \
  tini=0.19.0-r3 \
  syslog-ng=4.8.1-r1

COPY syslog-ng.conf /etc/syslog-ng/syslog-ng.conf
COPY logrotate.conf /etc/logrotate.d/feedsubscription.conf
COPY start.sh /start.sh

ENTRYPOINT [ "tini", "--" ]

CMD [ "/start.sh" ]

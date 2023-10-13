FROM alpine:3.18.4

VOLUME "/var/log/syslog-ng"
EXPOSE 514/udp 601/tcp 6514/tcp

RUN apk update && apk upgrade --no-cache

COPY syslog-ng.conf /etc/syslog-ng/syslog-ng.conf
COPY logrotate.conf /etc/logrotate.d/feedsubscription.conf
COPY start.sh /start.sh

ENTRYPOINT [ "tini", "--" ]

CMD [ "/start.sh" ]

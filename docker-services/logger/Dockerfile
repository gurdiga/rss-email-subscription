FROM alpine:3.14

VOLUME "/var/log/syslog-ng"
EXPOSE 514/udp 601/tcp 6514/tcp

RUN apk add --no-cache \
    syslog-ng=3.30.1-r1 \
    tini=0.19.0-r0

COPY syslog-ng.conf /etc/syslog-ng/syslog-ng.conf

ENTRYPOINT [ "tini", "--" ]

CMD [ "/bin/sh", "-c", "exec /usr/sbin/syslog-ng -F" ]

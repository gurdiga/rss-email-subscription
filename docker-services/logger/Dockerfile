FROM alpine:3.23.4

VOLUME /var/log/syslog-ng
EXPOSE 514/udp 601/tcp 6514/tcp

RUN apk update --no-cache && apk upgrade --no-cache

RUN apk add --no-cache \
  busybox=1.37.0-r30 \
  openssl=3.5.7-r0 \
  c-ares=1.34.8-r0 \
  tini=0.19.0-r3 \
  syslog-ng=4.10.2-r1 \
  logrotate=3.22.0-r0

# The curl CLI carries CVEs that are unfixed upstream at every version alpine
# ships, and nothing here invokes it. Scout scores the CLI and the library
# separately: curl is 3C/3H, libcurl is clean. syslog-ng needs only libcurl (for
# its http() destination), which apk keeps because syslog-ng depends on it.
RUN apk del curl

COPY syslog-ng.conf /etc/syslog-ng/syslog-ng.conf
COPY logrotate.conf /etc/logrotate.d/feedsubscription.conf
COPY start.sh /start.sh

ENTRYPOINT [ "tini", "--" ]

CMD [ "/start.sh" ]

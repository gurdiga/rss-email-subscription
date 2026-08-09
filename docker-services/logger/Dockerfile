FROM alpine:3.23.4

VOLUME /var/log/syslog-ng
EXPOSE 514/udp 601/tcp 6514/tcp

RUN apk update --no-cache && apk upgrade --no-cache

# curl is deliberately absent: nothing here invokes it, and syslog-ng needs only
# libcurl (for its http() destination), which apk pulls in as a dependency.
#
# This does NOT reduce the CVE count, so don't "fix" it by reinstalling curl and
# pinning: Scout attributes libcurl's vulnerabilities to the curl source
# package, so the findings persist as long as libcurl does. They are unfixed
# upstream at every version alpine ships — 8.20.0-r0 carries three CRITICALs,
# two of which 8.14.1-r2 also had. Omitting the binary only trims attack
# surface. website:latest can reach zero here because nginx needs no libcurl.
RUN apk add --no-cache \
  busybox=1.37.0-r30 \
  openssl=3.5.7-r0 \
  c-ares=1.34.8-r0 \
  tini=0.19.0-r3 \
  syslog-ng=4.10.2-r1 \
  logrotate=3.22.0-r0

COPY syslog-ng.conf /etc/syslog-ng/syslog-ng.conf
COPY logrotate.conf /etc/logrotate.d/feedsubscription.conf
COPY start.sh /start.sh

ENTRYPOINT [ "tini", "--" ]

CMD [ "/start.sh" ]

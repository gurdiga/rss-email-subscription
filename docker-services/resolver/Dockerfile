# Inspired by https://github.com/jpillora/docker-dnsmasq/blob/master/Dockerfile
FROM alpine:3.18.3

RUN apk update && apk upgrade --no-cache
RUN apk add --no-cache \
  openssl=3.1.2-r0 \
  dnsmasq=2.89-r5 \
  bind-tools=9.18.16-r0

COPY etc/default/dnsmasq /etc/default/dnsmasq
COPY etc/dnsmasq.conf /etc/dnsmasq.conf

ENTRYPOINT ["dnsmasq", "--no-daemon"]

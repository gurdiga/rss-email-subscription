# Inspired by https://github.com/jpillora/docker-dnsmasq/blob/master/Dockerfile
FROM ubuntu:23.04

RUN apt-get update \
  && apt-get install --no-install-recommends -y \
    dnsmasq=2.89-1 \
    dnsutils=1:9.18.12-1ubuntu1.1 \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

COPY etc/dnsmasq.conf /etc/dnsmasq.conf

ENTRYPOINT ["dnsmasq", "--keep-in-foreground"]

# Inspired by https://github.com/jpillora/docker-dnsmasq/blob/master/Dockerfile
FROM ubuntu:24.04

RUN apt-get update \
  && apt-get upgrade -y \
  && apt-get install --no-install-recommends -y \
    dnsmasq=2.90-2ubuntu0.1 \
    dnsutils=1:9.18.39-0ubuntu0.24.04.3 \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

COPY etc/dnsmasq.conf /etc/dnsmasq.conf

ENTRYPOINT ["dnsmasq", "--keep-in-foreground"]

# Inspired by https://github.com/jpillora/docker-dnsmasq/blob/master/Dockerfile
FROM ubuntu:23.10

RUN apt-get update \
  && apt-get install --no-install-recommends -y \
    dnsmasq=2.90-0ubuntu0.23.10.1 \
    dnsutils=1:9.18.24-0ubuntu0.23.10.1 \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

COPY etc/dnsmasq.conf /etc/dnsmasq.conf

ENTRYPOINT ["dnsmasq", "--keep-in-foreground"]

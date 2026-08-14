# Inspired by https://github.com/jpillora/docker-dnsmasq/blob/master/Dockerfile
FROM ubuntu:24.04@sha256:561618e2c15bf2397621dd04f96926663a3b5616c189cf7e38db7e82f5c538ea

RUN apt-get update \
  && apt-get upgrade -y \
  && apt-get install --no-install-recommends -y \
    dnsmasq=2.90-2ubuntu0.4 \
    dnsutils=1:9.18.39-0ubuntu0.24.04.5 \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

COPY etc/dnsmasq.conf /etc/dnsmasq.conf

ENTRYPOINT ["dnsmasq", "--keep-in-foreground"]

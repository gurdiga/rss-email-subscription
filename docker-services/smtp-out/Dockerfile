FROM boky/postfix:v3.6.1-alpine

RUN apk update
RUN apk add --no-cache \
  openssl=3.0.9-r3 \
  nghttp2=1.51.0-r1
RUN apk upgrade --no-cache

COPY etc/postfix/virtual /etc/postfix/virtual
COPY etc/postfix/transport /etc/postfix/transport
COPY etc/postfix/master.cf /etc/postfix/master.cf

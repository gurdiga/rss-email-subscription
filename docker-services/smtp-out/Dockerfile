FROM boky/postfix:v4.0.2-alpine

RUN apk update && apk upgrade --no-cache

# patches
RUN apk add --no-cache \
  perl=5.36.2-r0 \
  curl=8.5.0-r0 \
  openssl=3.1.4-r1

COPY etc/postfix/virtual /etc/postfix/virtual
COPY etc/postfix/transport /etc/postfix/transport
COPY etc/postfix/master.cf /etc/postfix/master.cf

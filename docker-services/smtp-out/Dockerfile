FROM boky/postfix:v4.4.0-alpine

RUN apk update --no-cache && apk upgrade --no-cache

COPY etc/postfix/virtual /etc/postfix/virtual
COPY etc/postfix/transport /etc/postfix/transport
COPY etc/postfix/master.cf /etc/postfix/master.cf

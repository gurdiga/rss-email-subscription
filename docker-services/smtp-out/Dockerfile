FROM boky/postfix:v4.4.0-alpine

RUN apk update --no-cache \
 && apk upgrade --no-cache \
 && apk add --no-cache --upgrade \
    'curl=8.14.1-r2' \
    'openssl=3.3.5-r0' \
    'expat=2.7.3-r0' \
    'sqlite=3.48.0-r4' \
    'py3-pip=24.3.1-r0' \
    'busybox=1.37.0-r14' \
    'c-ares=1.34.6-r0'

RUN python3 -m pip install --no-cache-dir --break-system-packages \
    'pip==25.3' \
    'setuptools==78.1.1'

COPY etc/postfix/virtual /etc/postfix/virtual
COPY etc/postfix/transport /etc/postfix/transport
COPY etc/postfix/master.cf /etc/postfix/master.cf

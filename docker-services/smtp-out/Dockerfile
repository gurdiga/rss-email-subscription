FROM boky/postfix:v5.0.1-alpine

RUN apk update --no-cache \
 && apk upgrade --no-cache \
 && apk add --no-cache 'py3-pip=25.1.1-r1'

RUN python3 -m pip install --no-cache-dir --break-system-packages \
    'pip==25.3' \
    'setuptools==80.9.0'

COPY etc/postfix/virtual /etc/postfix/virtual
COPY etc/postfix/transport /etc/postfix/transport
COPY etc/postfix/master.cf /etc/postfix/master.cf

FROM certbot/certbot:v4.2.0

RUN apk update --no-cache && apk upgrade --no-cache
RUN apk add --no-cache --upgrade \
    'busybox=1.36.1-r31' \
    'openssl=3.3.6-r0'
RUN python -m pip install --no-cache-dir 'pip==25.3' 'urllib3>=2.6.3' 'wheel>=0.46.0'
COPY docker-services/certbot/crontab /etc/crontabs/root
RUN chmod 600 /etc/crontabs/root

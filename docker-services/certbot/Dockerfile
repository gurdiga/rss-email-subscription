FROM certbot/certbot:v4.2.0

RUN apk update --no-cache && apk upgrade --no-cache
RUN apk add --no-cache --upgrade 'openssl=3.3.5-r0'
RUN python -m pip install --no-cache-dir 'pip==25.3'

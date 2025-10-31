FROM nginx:1.27.5-alpine3.21

RUN apk update --no-cache \
 && apk upgrade --no-cache \
 && apk add --no-cache --upgrade \
    'libxml2=2.13.9-r0' \
    'curl=8.14.1-r2' \
    'openssl=3.3.5-r0' \
    'expat=2.7.3-r0' \
    'tiff=4.7.1-r0'

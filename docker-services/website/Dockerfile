FROM nginx:1.25.3-alpine3.18

RUN apk update && apk upgrade --no-cache

# patches
RUN apk add --no-cache \
  openssl=3.1.4-r5

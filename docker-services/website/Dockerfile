FROM nginx:1.25.1-alpine

RUN apk update
RUN apk add --no-cache \
  openssl=3.0.9-r3 \
  nghttp2=1.51.0-r1
RUN apk upgrade --no-cache

# fix CVE-2023-3316 https://dso.docker.com/cve/CVE-2023-3316
RUN apk add --no-cache tiff=4.4.0-r4

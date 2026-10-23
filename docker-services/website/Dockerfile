FROM nginx:1.30.6-alpine3.24@sha256:47928bf67eb62a1863cb08d9ecb52d3e704304ba614eaee17884204677702951

# curl ships in the nginx base image, but nothing here uses it: nginx does not
# link libcurl, no healthcheck or script calls it, and libcurl's only reverse
# dependency is curl itself. Deleting both keeps their recurring CVEs out of
# the image instead of chasing them with version pins.
RUN apk update --no-cache \
 && apk upgrade --no-cache \
 && apk del curl

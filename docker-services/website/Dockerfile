FROM nginx:1.30.7-alpine3.24@sha256:caf4e1e032a20f9c3c5e28fc7f25ffd768ad8677b4975c54193075997b3a97e3

# curl ships in the nginx base image, but nothing here uses it: nginx does not
# link libcurl, no healthcheck or script calls it, and libcurl's only reverse
# dependency is curl itself. Deleting both keeps their recurring CVEs out of
# the image instead of chasing them with version pins.
RUN apk update --no-cache \
 && apk upgrade --no-cache \
 && apk del curl

# hadolint ignore=DL3007
FROM app:latest

VOLUME "/smtp-out.log"

RUN apk add --no-cache \
  coreutils=9.1-r0

CMD ["/bin/sh", "-c", "tail --lines=0 --follow=name --retry /smtp-out.log | node dist/app/delivery-monitoring"]

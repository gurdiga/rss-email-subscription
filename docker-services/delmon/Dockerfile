# hadolint ignore=DL3007
FROM app:latest

VOLUME "/logs"

RUN apk update && apk upgrade --no-cache
RUN apk add --no-cache \
  coreutils=9.3-r1

CMD ["/bin/sh", "-c", "tail --lines=0 --follow=name --retry /logs/smtp-out.log | node dist/app/delivery-monitoring"]

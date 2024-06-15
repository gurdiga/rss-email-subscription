# hadolint ignore=DL3007
FROM app:latest

VOLUME "/logs"

RUN apk update && apk upgrade --no-cache

CMD ["/bin/sh", "-c", "tail -n 0 -F /logs/smtp-out.log | node dist/app/delivery-monitoring"]

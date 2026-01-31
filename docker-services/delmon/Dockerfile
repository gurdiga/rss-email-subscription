# hadolint ignore=DL3007
FROM app:latest

VOLUME /logs

CMD ["/bin/sh", "-c", "tail -n 0 -F /logs/smtp-out-new.log | node dist/app/delivery-monitoring"]

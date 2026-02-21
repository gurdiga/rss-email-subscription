# hadolint ignore=DL3007
FROM app:latest

VOLUME /logs

CMD ["/bin/sh", "-c", "tail -n 0 -F $SMTP_OUT_LOG | node dist/app/delivery-monitoring"]

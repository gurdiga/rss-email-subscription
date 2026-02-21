# hadolint ignore=DL3007
FROM app:latest

VOLUME /logs

CMD ["/bin/sh", "-c", "tail -n 0 -F ${SMTP_OUT_LOG:?SMTP_OUT_LOG is not set} | node dist/app/delivery-monitoring"]

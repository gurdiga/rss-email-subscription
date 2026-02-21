# hadolint ignore=DL3007
FROM app:latest

VOLUME /logs

# hadolint ignore=DL3025
CMD tail -n 0 -F "${SMTP_OUT_LOG:?SMTP_OUT_LOG is not set}" \
    | node dist/app/delivery-monitoring

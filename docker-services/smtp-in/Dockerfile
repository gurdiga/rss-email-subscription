FROM zixia/simple-mail-forwarder:1.4

RUN apk update --no-cache && apk upgrade --no-cache

ENV SASL_LOGIN=catch-all
ENV SASL_DOMAIN=feedsubscription.com

SHELL ["/bin/bash", "-o", "pipefail", "-c"]
RUN postconf -e smtpd_relay_restrictions="permit_sasl_authenticated reject_unauth_destination"
RUN postconf -e smtpd_sasl_local_domain="${SASL_DOMAIN}"
RUN \
  --mount=type=secret,id=SMTP_IN_SASL_PASSWORD \
  saslpasswd2 -p -c -u "${SASL_DOMAIN}" "${SASL_LOGIN}" < /run/secrets/SMTP_IN_SASL_PASSWORD

COPY etc/sasl2/smtpd.conf /etc/sasl2/smtpd.conf

# Remove some of the irrelevant tests.
# 1. docker cp smtp-in:/app/test/simple-mail-forwarder.bats docker-services/smtp-in/
# 2. edit docker-services/smtp-in/simple-mail-forwarder.bats
COPY simple-mail-forwarder.bats /app/test/

FROM zixia/simple-mail-forwarder:1.4

RUN apk update --no-cache \
  && apk upgrade --no-cache \
  && apk add --no-cache postgrey=1.37-r2

ENV SASL_LOGIN=catch-all
ENV SASL_DOMAIN=feedsubscription.com

SHELL ["/bin/bash", "-o", "pipefail", "-c"]
RUN postconf -e smtpd_relay_restrictions="permit_sasl_authenticated reject_unauth_destination"
RUN postconf -e smtpd_recipient_restrictions="permit_mynetworks, permit_sasl_authenticated, reject_unauth_destination, check_policy_service inet:127.0.0.1:10023"
RUN postconf -e smtpd_sasl_local_domain="${SASL_DOMAIN}"
RUN \
  --mount=type=secret,id=SMTP_IN_SASL_PASSWORD \
  saslpasswd2 -p -c -u "${SASL_DOMAIN}" "${SASL_LOGIN}" < /run/secrets/SMTP_IN_SASL_PASSWORD

COPY etc/sasl2/smtpd.conf /etc/sasl2/smtpd.conf

# Remove some of the irrelevant tests.
# 1. docker cp smtp-in:/app/test/simple-mail-forwarder.bats docker-services/smtp-in/
# 2. edit docker-services/smtp-in/simple-mail-forwarder.bats
COPY simple-mail-forwarder.bats /app/test/

# Start postgrey before delegating to the base image command
COPY entrypoint-with-postgrey.sh /usr/local/bin/entrypoint-with-postgrey.sh
RUN chmod +x /usr/local/bin/entrypoint-with-postgrey.sh
ENTRYPOINT ["/usr/local/bin/entrypoint-with-postgrey.sh"]

FROM zixia/simple-mail-forwarder:1.4

RUN apk update --no-cache \
  && apk upgrade --no-cache \
  && apk add --no-cache \
    postgrey=1.37-r2 \
    patch=2.7.6-r7

# Prepare postgrey runtime directories with correct ownership
RUN mkdir -p /var/spool/postfix/postgrey /var/lib/postgrey /var/run/postgrey \
  && chown -R postgrey:postgrey /var/spool/postfix/postgrey /var/lib/postgrey /var/run/postgrey

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

# Apply a minimal patch to upstream tests to fit our setup
COPY patches/simple-mail-forwarder.patch /tmp/simple-mail-forwarder.patch
WORKDIR /app/test
RUN patch -p0 < /tmp/simple-mail-forwarder.patch
WORKDIR /

# Start postgrey before delegating to the base image command
COPY entrypoint-with-postgrey.sh /usr/local/bin/entrypoint-with-postgrey.sh
RUN chmod +x /usr/local/bin/entrypoint-with-postgrey.sh
ENTRYPOINT ["/usr/local/bin/entrypoint-with-postgrey.sh"]

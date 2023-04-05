FROM zixia/simple-mail-forwarder:1.4

ARG SASL_PASSWORD

ENV SASL_LOGIN=catch-all
ENV SASL_DOMAIN=feedsubscription.com

SHELL ["/bin/bash", "-o", "pipefail", "-c"]
RUN postconf -e smtpd_relay_restrictions="permit_mynetworks permit_sasl_authenticated reject_unauth_destination"
RUN postconf -e smtpd_sasl_local_domain="${SASL_DOMAIN}"
RUN echo "${SASL_PASSWORD}" | saslpasswd2 -p -c -u "${SASL_DOMAIN}" "${SASL_LOGIN}"

COPY etc/sasl2/smtpd.conf /etc/sasl2/smtpd.conf

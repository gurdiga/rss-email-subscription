FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
 && apt-get upgrade -y \
 && apt-get install -y --no-install-recommends \
    'postfix=3.7.11-0+deb12u1' \
    'opendkim=2.11.0~beta2-8+deb12u1' \
    'opendkim-tools=2.11.0~beta2-8+deb12u1' \
    'sasl2-bin=2.1.28+dfsg-10' \
    'libsasl2-modules=2.1.28+dfsg-10' \
    'bind9-dnsutils=1:9.18.49-1~deb12u1' \
    'ca-certificates=20230311+deb12u1' \
    'procps=2:4.0.2-3' \
    'net-tools=2.10-0.1+deb12u2' \
 && rm -rf /var/lib/apt/lists/*

RUN mkdir -p \
    /etc/postfix/sasl \
    /etc/opendkim \
    /var/run/opendkim

# NOTE: All postfix lookup tables are texthash: — no postmap/BerkeleyDB.
COPY etc/postfix/sasl/smtpd.conf /etc/postfix/sasl/smtpd.conf
COPY etc/postfix/virtual /etc/postfix/virtual
COPY etc/postfix/sender_logins /etc/postfix/sender_logins
COPY etc/postfix/main.cf.override /etc/postfix/main.cf.override
COPY etc/opendkim/opendkim.conf /etc/opendkim/opendkim.conf
COPY etc/opendkim/KeyTable /etc/opendkim/KeyTable
COPY etc/opendkim/SigningTable /etc/opendkim/SigningTable
COPY etc/opendkim/TrustedHosts /etc/opendkim/TrustedHosts
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]

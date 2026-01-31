FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

# Install packages with pinned versions
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
    # Core mail services
    'postfix=3.7.11-0+deb12u1' \
    'opendkim=2.11.0~beta2-8+deb12u1' \
    'ca-certificates=20230311+deb12u1' \
    # Utilities
    'bind9-dnsutils=1:9.18.44-1~deb12u1' \
    'procps=2:4.0.2-3' \
    'net-tools=2.10-0.1+deb12u2' \
 && rm -rf /var/lib/apt/lists/*

# Create required directories
RUN mkdir -p \
    /etc/opendkim \
    /var/run/opendkim

# Copy configuration files
COPY etc/postfix/virtual /etc/postfix/virtual
COPY etc/postfix/transport /etc/postfix/transport
COPY etc/postfix/master.cf /etc/postfix/master.cf
COPY etc/postfix/main.cf.override /etc/postfix/main.cf.override
COPY etc/opendkim/opendkim.conf /etc/opendkim/opendkim.conf
COPY etc/opendkim/KeyTable /etc/opendkim/KeyTable
COPY etc/opendkim/SigningTable /etc/opendkim/SigningTable
COPY etc/opendkim/TrustedHosts /etc/opendkim/TrustedHosts
COPY entrypoint.sh /usr/local/bin/entrypoint.sh

# Generate postfix lookup tables
RUN postmap /etc/postfix/virtual \
 && postmap /etc/postfix/transport

# Make entrypoint executable
RUN chmod +x /usr/local/bin/entrypoint.sh

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]

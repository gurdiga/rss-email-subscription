FROM debian:bookworm-slim@sha256:abd67ffcfa541b485a3dff59865ab629aa048a6c613e639d36e7456b0b229241

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
 && apt-get upgrade -y \
 && apt-get install -y --no-install-recommends \
    'postfix=3.7.11-0+deb12u1' \
    'postfix-pcre=3.7.11-0+deb12u1' \
    'postsrsd=1.10-2+b1' \
    'sasl2-bin=2.1.28+dfsg-10+deb12u1' \
    'libsasl2-modules=2.1.28+dfsg-10+deb12u1' \
    'bind9-dnsutils=1:9.18.49-1~deb12u3' \
    'ca-certificates=20250419~deb12u2' \
    'procps=2:4.0.2-3' \
    'net-tools=2.10-0.1+deb12u2' \
 && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /etc/sasl2

COPY etc/sasl2/smtpd.conf /etc/sasl2/smtpd.conf
COPY etc/postfix/virtual /etc/postfix/virtual
COPY etc/postfix/main.cf.override /etc/postfix/main.cf.override
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh
# TODO(debian-upgrade): postmap uses BerkeleyDB, deprecated in Postfix 3.11+.
# Migrate to LMDB or CDB when upgrading the base image.
RUN postmap /etc/postfix/virtual

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]

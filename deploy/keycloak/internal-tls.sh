#!/usr/bin/env bash
# Creates the internal TLS certificate for the connection between Caddy and Keycloak
# (re-encrypt, see the Keycloak reverse proxy guide). Runs in the tls-init service,
# as the Keycloak user, with the internal-tls volume mounted at $DIR.
#
# This certificate is never shown to browsers: the public certificates are managed by
# Caddy (Let's Encrypt). Caddy trusts exactly this certificate.
#
# Usage (by docker compose): internal-tls.sh          create if missing
#                            internal-tls.sh renew    replace the existing certificate

set -euo pipefail

DIR=/opt/keycloak/conf/internal-tls
VALIDITY_DAYS=3650
# The truststore only contains the public certificate, so its password protects nothing secret
TRUSTSTORE_PASSWORD=truststore

if [ -f "$DIR/keystore.p12" ] && [ "${1:-}" != "renew" ]; then
	echo "Internal TLS certificate exists:"
	keytool -list -v -keystore "$DIR/keystore.p12" -storepass "$INTERNAL_TLS_KEYSTORE_PASSWORD" | grep -m1 "Valid from"
	exit 0
fi

umask 077
rm -f "$DIR/keystore.p12" "$DIR/tls.crt" "$DIR/truststore.p12"

# Key pair and self-signed certificate, for the hostname Caddy uses (keycloak) and for
# the admin CLI inside the container (localhost)
keytool -genkeypair -noprompt \
	-alias keycloak -keyalg EC -groupname secp256r1 \
	-dname "CN=keycloak" -ext "SAN=dns:keycloak,dns:localhost,ip:127.0.0.1" \
	-validity "$VALIDITY_DAYS" \
	-storetype PKCS12 -keystore "$DIR/keystore.p12" -storepass "$INTERNAL_TLS_KEYSTORE_PASSWORD"

# The certificate (not the key) in PEM format, for Caddy
keytool -exportcert -rfc -alias keycloak \
	-keystore "$DIR/keystore.p12" -storepass "$INTERNAL_TLS_KEYSTORE_PASSWORD" -file "$DIR/tls.crt"

# A truststore with the certificate, for the admin CLI (kcadm.sh)
keytool -importcert -noprompt -alias keycloak -file "$DIR/tls.crt" \
	-storetype PKCS12 -keystore "$DIR/truststore.p12" -storepass "$TRUSTSTORE_PASSWORD"

chmod 644 "$DIR/tls.crt" "$DIR/truststore.p12"
echo "Internal TLS certificate created (valid for $VALIDITY_DAYS days)"

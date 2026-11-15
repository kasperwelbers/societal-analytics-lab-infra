#!/usr/bin/env bash
# Keycloak's admin CLI (kcadm.sh), run inside the Keycloak container over the internal
# TLS connection. The login is kept until the container restarts.
#
# Usage: ./admin-cli.sh login [username]    log in to the master realm (prompts for the password;
#                                           the username defaults to temp-admin)
#        ./admin-cli.sh <kcadm arguments>   e.g. ./admin-cli.sh get realms --fields realm

set -euo pipefail
cd "$(dirname "$0")"

kcadm=(docker compose exec keycloak /opt/keycloak/bin/kcadm.sh)
config=(--config /tmp/kcadm.config)

if [ "${1:-}" = "login" ]; then
	# Trust the internal certificate (no input needed, so no terminal)
	docker compose exec -T keycloak /opt/keycloak/bin/kcadm.sh config truststore --trustpass truststore /opt/keycloak/conf/internal-tls/truststore.p12 "${config[@]}" </dev/null
	exec "${kcadm[@]}" config credentials --server https://localhost:8443 --realm master --user "${2:-temp-admin}" "${config[@]}"
fi

exec "${kcadm[@]}" "$@" "${config[@]}"

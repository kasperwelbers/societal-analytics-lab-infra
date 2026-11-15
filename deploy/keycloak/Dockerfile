# Optimized Keycloak image, following "Running Keycloak in a container":
# https://www.keycloak.org/server/containers
#
# Build options (database vendor, health endpoints) are baked in with
# `kc.sh build`, so the container starts with `start --optimized`.
# Runtime options (hostname, database URL and credentials) are set in
# docker-compose.yml.

# The image (and so the Keycloak version) is set in docker-compose.yml.
ARG KEYCLOAK_IMAGE

FROM ${KEYCLOAK_IMAGE} AS builder

ENV KC_DB=postgres
ENV KC_HEALTH_ENABLED=true
# A single server: no clustering between Keycloak instances
ENV KC_CACHE=local

WORKDIR /opt/keycloak
RUN /opt/keycloak/bin/kc.sh build

FROM ${KEYCLOAK_IMAGE}
COPY --from=builder /opt/keycloak/ /opt/keycloak/
ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]

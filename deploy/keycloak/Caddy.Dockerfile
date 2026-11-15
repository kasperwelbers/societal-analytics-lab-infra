# Caddy with the rate limit module (https://github.com/mholt/caddy-ratelimit), used to limit
# requests that make Keycloak send emails (see the Caddyfile).
# The module has no recent release, so it is pinned to a commit.

ARG CADDY_VERSION=2.11.9
ARG RATELIMIT_COMMIT=5625512f24f6f59d6f64fb3aafe5eecff0b286db

FROM caddy:${CADDY_VERSION}-builder AS builder
ARG RATELIMIT_COMMIT
RUN xcaddy build --with github.com/mholt/caddy-ratelimit@${RATELIMIT_COMMIT}

FROM caddy:${CADDY_VERSION}-alpine
COPY --from=builder /usr/bin/caddy /usr/bin/caddy

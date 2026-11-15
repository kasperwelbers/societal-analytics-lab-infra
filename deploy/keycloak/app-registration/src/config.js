// Settings, from environment variables (set in docker-compose.yml and .env)

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Environment variable ${name} is not set`);
  return value;
}

function integer(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new Error(`Environment variable ${name} must be a whole number`);
  return n;
}

const stripSlash = (url) => url.replace(/\/+$/, '');

export const config = {
  port: integer('PORT', 3000),
  // Where this site is reachable, e.g. https://apps.example.org
  publicUrl: stripSlash(required('PUBLIC_URL')),
  // The public issuer of the idp realm, e.g. https://auth.example.org/realms/idp
  issuer: stripSlash(required('OIDC_ISSUER')),
  // Keycloak as reached from inside the Docker network, e.g. https://keycloak:8443.
  // Server-to-server calls (discovery, token endpoint, keys, admin API) go here instead of
  // through the public hostname (which doesn't expose the admin API).
  keycloakInternalUrl: stripSlash(required('KEYCLOAK_INTERNAL_URL')),
  clientId: required('OIDC_CLIENT_ID'),
  clientSecret: required('OIDC_CLIENT_SECRET'),
  // Signs the session cookie: generate with `openssl rand -hex 32`
  sessionSecret: required('SESSION_SECRET'),
  maxAppsPerUser: integer('MAX_APPS_PER_USER', 3),
  // Emails (verification, password reset, account linking) per app in 24 hours
  emailLimit: integer('EMAIL_LIMIT_PER_DAY', 100),
  emailCheckMinutes: integer('EMAIL_CHECK_MINUTES', 5),
  contact: process.env.CONTACT_EMAIL || '',
};

if (config.sessionSecret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters');

const issuerUrl = new URL(config.issuer);
export const realm = issuerUrl.pathname.match(/\/realms\/([^/]+)$/)?.[1];
if (!realm) throw new Error('OIDC_ISSUER must end with /realms/<realm>');
export const publicKeycloakOrigin = issuerUrl.origin;

// Registered apps: validating the form, and turning it into a Keycloak client (and back).
//
// Ownership is stored as client attributes. Owners can't edit clients in Keycloak directly
// (only through this site), so these attributes can be trusted. Admins change them with kcadm
// (see docs/app-registration.md).

import crypto from 'node:crypto';

export const ATTR = {
  owner: 'registration.owner', // user id (sub) of the owner
  ownerEmail: 'registration.owner_email', // email of the owner when the app was registered
};

const MAX_URIS = 10;

export class ValidationError extends Error {}

// A redirect URI: https, or http on the local machine only (for development).
// No wildcards, fragments or credentials. Keycloak's client policy checks this too.
export function checkRedirectUri(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new ValidationError(`${label}: "${value}" is not a valid URL`);
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new ValidationError(`${label}: "${value}" must start with https:// (http:// is only allowed for localhost)`);
  }
  if (value.includes('*')) throw new ValidationError(`${label}: wildcards (*) are not allowed`);
  if (url.hash || value.includes('#')) throw new ValidationError(`${label}: "${value}" can't contain a #fragment`);
  if (url.username || url.password) throw new ValidationError(`${label}: "${value}" can't contain a user name or password`);
  return url.href;
}

function optionalHttpsUrl(value, label) {
  if (!value) return '';
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new ValidationError(`${label}: "${value}" is not a valid URL`);
  }
  if (url.protocol !== 'https:') throw new ValidationError(`${label} must start with https://`);
  return url.href;
}

function text(value, label, { required = false, max }) {
  const v = String(value ?? '').trim();
  if (required && !v) throw new ValidationError(`${label} is required`);
  if (v.length > max) throw new ValidationError(`${label} can be at most ${max} characters`);
  if (/[\u0000-\u001f\u007f]/.test(v.replace(/[\r\n\t]/g, ' '))) throw new ValidationError(`${label} contains invalid characters`);
  return v;
}

function uriList(value, label, { min }) {
  const items = String(value ?? '')
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (items.length < min) throw new ValidationError(`${label}: add at least ${min}`);
  if (items.length > MAX_URIS) throw new ValidationError(`${label}: at most ${MAX_URIS}`);
  return [...new Set(items.map((u) => checkRedirectUri(u, label)))];
}

// Form fields -> validated settings
export function parseForm(form) {
  return {
    name: text(form.name, 'Name', { required: true, max: 60 }),
    description: text(form.description, 'Description', { max: 300 }),
    homeUrl: optionalHttpsUrl(text(form.homeUrl, 'Home page', { max: 300 }), 'Home page'),
    redirectUris: uriList(form.redirectUris, 'Redirect URIs', { min: 1 }),
    logoutUris: uriList(form.logoutUris, 'Post logout redirect URIs', { min: 0 }),
    logoUri: optionalHttpsUrl(text(form.logoUri, 'Logo URL', { max: 300 }), 'Logo URL'),
    policyUri: optionalHttpsUrl(text(form.policyUri, 'Privacy policy URL', { max: 300 }), 'Privacy policy URL'),
    tosUri: optionalHttpsUrl(text(form.tosUri, 'Terms of service URL', { max: 300 }), 'Terms of service URL'),
  };
}

// Keycloak client -> settings (for the edit form)
export function settingsOf(client) {
  const a = client.attributes || {};
  return {
    name: client.name || '',
    description: client.description || '',
    homeUrl: client.baseUrl || '',
    redirectUris: client.redirectUris || [],
    logoutUris: (a['post.logout.redirect.uris'] || '').split('##').filter((u) => u && u !== '+'),
    logoUri: a.logoUri || '',
    policyUri: a.policyUri || '',
    tosUri: a.tosUri || '',
  };
}

// A readable, unique client ID: the name as a slug, plus a random suffix
export function newClientId(name) {
  const slug = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)
    .replace(/-+$/, '');
  return `${slug || 'app'}-${crypto.randomBytes(3).toString('hex')}`;
}

// Apply settings to a (new or existing) client. Only these fields are under the owner's
// control; everything else is fixed here (and consent and PKCE are also enforced by the
// client policy in Keycloak).
export function applySettings(client, s) {
  client.name = s.name;
  client.description = s.description;
  client.baseUrl = s.homeUrl;
  client.redirectUris = s.redirectUris;
  client.attributes = {
    ...client.attributes,
    // "+" (Keycloak's default): the same as the redirect URIs. Keycloak refuses an empty value.
    'post.logout.redirect.uris': s.logoutUris.length ? s.logoutUris.join('##') : '+',
    logoUri: s.logoUri,
    policyUri: s.policyUri,
    tosUri: s.tosUri,
  };
  return client;
}

export function newClient(settings, user) {
  return applySettings(
    {
      clientId: newClientId(settings.name),
      enabled: true,
      protocol: 'openid-connect',
      publicClient: false,
      clientAuthenticatorType: 'client-secret',
      standardFlowEnabled: true,
      implicitFlowEnabled: false,
      directAccessGrantsEnabled: false,
      serviceAccountsEnabled: false,
      consentRequired: true,
      // Tokens for these apps don't need the user's roles in this realm
      fullScopeAllowed: false,
      frontchannelLogout: false,
      webOrigins: [],
      attributes: {
        'pkce.code.challenge.method': 'S256',
        'oauth2.device.authorization.grant.enabled': 'false',
        'oidc.ciba.grant.enabled': 'false',
        'display.on.consent.screen': 'false',
        [ATTR.owner]: user.sub,
        [ATTR.ownerEmail]: user.email,
      },
    },
    settings,
  );
}

export const isOwner = (client, user) => client?.attributes?.[ATTR.owner] === user.sub;
export const isRegistered = (client) => Boolean(client?.attributes?.[ATTR.owner]);

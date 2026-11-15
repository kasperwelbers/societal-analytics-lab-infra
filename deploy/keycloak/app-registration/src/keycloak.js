// Calls to Keycloak: the admin API (as this app's service account) and server-to-server OIDC.

import { config, realm, publicKeycloakOrigin } from './config.js';

// Send server-to-server requests for the public Keycloak hostname to the internal address
// instead. Keycloak issues the same tokens either way (its hostname is fixed).
export function internalFetch(url, init) {
  const href = url instanceof URL ? url.href : url instanceof Request ? url.url : String(url);
  if (href.startsWith(publicKeycloakOrigin + '/')) {
    const target = config.keycloakInternalUrl + href.slice(publicKeycloakOrigin.length);
    return url instanceof Request ? fetch(new Request(target, url), init) : fetch(target, init);
  }
  return fetch(url, init);
}

export class KeycloakError extends Error {
  constructor(status, body) {
    // Keycloak explains rejected changes (e.g. by the client policy) in error_description
    super(body?.error_description || body?.errorMessage || body?.error || `Keycloak returned ${status}`);
    this.status = status;
  }
}

let serviceToken = null;

async function getServiceToken() {
  if (serviceToken && serviceToken.expires > Date.now() + 30_000) return serviceToken.value;
  const res = await internalFetch(`${config.issuer}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.access_token) throw new KeycloakError(res.status, body);
  serviceToken = { value: body.access_token, expires: Date.now() + body.expires_in * 1000 };
  return serviceToken.value;
}

async function admin(method, path, body) {
  const res = await fetch(`${config.keycloakInternalUrl}/admin/realms/${realm}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${await getServiceToken()}`,
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new KeycloakError(res.status, data);
  return data;
}

// --- Clients ---------------------------------------------------------------------------------

// All clients, with attributes. Keycloak doesn't allow searching clients by attribute by
// default, and the number of clients is small, so we page through all of them.
export async function listClients() {
  const all = [];
  for (let first = 0; ; first += 200) {
    const page = await admin('GET', `/clients?first=${first}&max=200`);
    all.push(...page);
    if (page.length < 200) return all;
  }
}

export async function getClient(clientId) {
  const found = await admin('GET', `/clients?clientId=${encodeURIComponent(clientId)}`);
  return found.find((c) => c.clientId === clientId) || null;
}

export const createClient = (representation) => admin('POST', '/clients', representation);
export const updateClient = (client) => admin('PUT', `/clients/${client.id}`, client);
export const deleteClient = (client) => admin('DELETE', `/clients/${client.id}`);
export const getClientSecret = async (client) =>
  (await admin('GET', `/clients/${client.id}/client-secret`)).value;
export const regenerateClientSecret = async (client) =>
  (await admin('POST', `/clients/${client.id}/client-secret`)).value;

// --- Events ----------------------------------------------------------------------------------

// Events of the given types since the given time (ms), oldest pages first
export async function listEvents(types, since) {
  const all = [];
  const query = new URLSearchParams({ dateFrom: String(since) });
  for (const type of types) query.append('type', type);
  for (let first = 0; ; first += 1000) {
    query.set('first', String(first));
    query.set('max', '1000');
    const page = await admin('GET', `/events?${query}`);
    all.push(...page);
    if (page.length < 1000) return all;
  }
}

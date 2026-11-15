// Email limit per app: Keycloak sends emails on behalf of an app (email verification after
// registration, password reset, linking an external account). If an app causes more emails
// in 24 hours than its limit, this site disables it. It is enabled again automatically once
// the count over the last 24 hours is below the limit. Apps that an admin disabled are left
// alone. Caddy separately limits these requests per IP address.

import { config } from './config.js';
import { ATTR, emailLimitOf, isRegistered } from './apps.js';
import { listClients, listEvents, updateClient } from './keycloak.js';

export const EMAIL_EVENTS = ['SEND_VERIFY_EMAIL', 'SEND_RESET_PASSWORD', 'SEND_IDENTITY_PROVIDER_LINK'];
const DAY = 24 * 60 * 60 * 1000;

// Number of emails per client ID in the last 24 hours
export async function emailCounts() {
  const since = Date.now() - DAY;
  const counts = new Map();
  for (const event of await listEvents(EMAIL_EVENTS, since)) {
    if (event.time < since || !event.clientId) continue;
    counts.set(event.clientId, (counts.get(event.clientId) || 0) + 1);
  }
  return counts;
}

// What to do with one client: "disable", "enable" or null
export function decide(client, count, defaultLimit) {
  const over = count > emailLimitOf(client, defaultLimit);
  const disabledByUs = client.attributes?.[ATTR.disabledBy] === 'email-limit';
  if (over && client.enabled) return 'disable';
  if (!over && !client.enabled && disabledByUs) return 'enable';
  return null;
}

export async function enforceEmailLimits() {
  const counts = await emailCounts();
  for (const client of await listClients()) {
    if (!isRegistered(client)) continue;
    const count = counts.get(client.clientId) || 0;
    const action = decide(client, count, config.emailLimit);
    if (!action) continue;
    const attributes = { ...client.attributes };
    // Keycloak keeps attributes that are left out of an update: clear it with an empty value
    attributes[ATTR.disabledBy] = action === 'disable' ? 'email-limit' : '';
    await updateClient({ ...client, enabled: action === 'enable', attributes });
    console.log(`email limit: ${action}d ${client.clientId} (${count} emails in 24 hours)`);
  }
}

export function startEmailLimitJob() {
  if (!config.emailCheckMinutes) return;
  const run = () =>
    enforceEmailLimits().catch((err) => console.error(`email limit check failed: ${err.message}`));
  run();
  setInterval(run, config.emailCheckMinutes * 60 * 1000).unref();
}

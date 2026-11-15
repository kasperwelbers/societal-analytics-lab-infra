import { test } from 'node:test';
import assert from 'node:assert/strict';

// email-limit.js reads the configuration on import
Object.assign(process.env, {
  PUBLIC_URL: 'https://apps.example.org',
  OIDC_ISSUER: 'https://auth.example.org/realms/idp',
  KEYCLOAK_INTERNAL_URL: 'https://keycloak:8443',
  OIDC_CLIENT_ID: 'app-registration',
  OIDC_CLIENT_SECRET: 'test',
  SESSION_SECRET: 'x'.repeat(32),
});
const { decide } = await import('../src/email-limit.js');
const { ATTR } = await import('../src/apps.js');

const app = (enabled, attributes = {}) => ({ enabled, attributes: { [ATTR.owner]: 'u', ...attributes } });

test('disable an active app over its limit', () => {
  assert.equal(decide(app(true), 101, 100), 'disable');
  assert.equal(decide(app(true), 100, 100), null);
  assert.equal(decide(app(true, { [ATTR.emailLimit]: '500' }), 101, 100), null);
});

test('enable again only apps that this site disabled', () => {
  assert.equal(decide(app(false, { [ATTR.disabledBy]: 'email-limit' }), 50, 100), 'enable');
  assert.equal(decide(app(false, { [ATTR.disabledBy]: 'email-limit' }), 150, 100), null);
  assert.equal(decide(app(false), 0, 100), null); // disabled by an admin
});

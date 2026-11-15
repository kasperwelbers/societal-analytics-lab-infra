import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ATTR, ValidationError, checkRedirectUri, emailLimitOf, newClient, newClientId, parseForm, settingsOf } from '../src/apps.js';

test('redirect URIs: https anywhere, http only on the local machine', () => {
  assert.equal(checkRedirectUri('https://app.example.org/callback', 'x'), 'https://app.example.org/callback');
  for (const ok of ['http://localhost:3000/cb', 'http://127.0.0.1:5173/cb', 'http://[::1]:8080/cb']) {
    assert.doesNotThrow(() => checkRedirectUri(ok, 'x'), ok);
  }
  for (const bad of [
    'http://app.example.org/cb', // http on a real host
    'https://app.example.org/*', // wildcard
    'https://*.example.org/cb',
    'https://app.example.org/cb#x', // fragment
    'https://user:pw@app.example.org/cb', // credentials
    'javascript:alert(1)',
    'myapp://callback', // custom schemes are not supported
    'not a url',
    'http://localhost.example.org/cb',
  ]) {
    assert.throws(() => checkRedirectUri(bad, 'x'), ValidationError, bad);
  }
});

test('form: required fields, limits and cleanup', () => {
  const s = parseForm({ name: '  My App ', redirectUris: 'https://a.example.org/cb\nhttps://a.example.org/cb\n\nhttp://localhost:3000/cb' });
  assert.equal(s.name, 'My App');
  assert.deepEqual(s.redirectUris, ['https://a.example.org/cb', 'http://localhost:3000/cb']);
  assert.deepEqual(s.logoutUris, []);
  assert.throws(() => parseForm({ name: '', redirectUris: 'https://a.example.org/cb' }), /Name is required/);
  assert.throws(() => parseForm({ name: 'x', redirectUris: '' }), /at least 1/);
  assert.throws(() => parseForm({ name: 'x'.repeat(61), redirectUris: 'https://a.example.org/cb' }), /at most 60/);
  assert.throws(() => parseForm({ name: 'x', redirectUris: 'https://a.example.org/cb', logoUri: 'http://a.example.org/logo.png' }), /https/);
  const many = Array.from({ length: 11 }, (_, i) => `https://a.example.org/${i}`).join('\n');
  assert.throws(() => parseForm({ name: 'x', redirectUris: many }), /at most 10/);
});

test('new client: fixed safe settings, owner, round trip of settings', () => {
  const settings = parseForm({ name: 'Survey tool', redirectUris: 'https://s.example.org/cb', logoutUris: 'https://s.example.org/', policyUri: 'https://s.example.org/privacy' });
  const client = newClient(settings, { sub: 'user-1', email: 'u@example.org' });
  assert.match(client.clientId, /^survey-tool-[0-9a-f]{6}$/);
  assert.equal(client.consentRequired, true);
  assert.equal(client.publicClient, false);
  assert.equal(client.directAccessGrantsEnabled, false);
  assert.equal(client.implicitFlowEnabled, false);
  assert.equal(client.serviceAccountsEnabled, false);
  assert.equal(client.attributes['pkce.code.challenge.method'], 'S256');
  assert.equal(client.attributes[ATTR.owner], 'user-1');
  assert.deepEqual(settingsOf(client), settings);
});

test('client IDs are readable slugs', () => {
  assert.match(newClientId('Ünïcode & Spaces!'), /^unicode-spaces-[0-9a-f]{6}$/);
  assert.match(newClientId('***'), /^app-[0-9a-f]{6}$/);
});

test('email limit: default, or per app as set by admins', () => {
  assert.equal(emailLimitOf({ attributes: {} }, 100), 100);
  assert.equal(emailLimitOf({ attributes: { [ATTR.emailLimit]: '500' } }, 100), 500);
  assert.equal(emailLimitOf({ attributes: { [ATTR.emailLimit]: 'lots' } }, 100), 100);
});

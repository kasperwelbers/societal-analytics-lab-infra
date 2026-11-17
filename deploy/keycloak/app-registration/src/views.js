// HTML pages. The html`` helper escapes every interpolated value.

import { readFileSync } from 'node:fs';
import { html, raw } from 'hono/html';
import { config } from './config.js';

// The lab logo, served at /logo.svg (the same file as in the Keycloak themes)
export const logoSvg = readFileSync(new URL('./logo.svg', import.meta.url), 'utf8');

const style = raw(`
  :root { --fg:#1d1d1f; --muted:#5f6368; --line:#d9dce1; --bg:#fff; --accent:#0180c9; --warn:#b3261e; --ok:#146c2e; --soft:#f4f6f9; }
  @media (prefers-color-scheme: dark) { :root { --fg:#e8eaed; --muted:#a0a4ab; --line:#3c4043; --bg:#17181a; --accent:#8ab4f8; --warn:#f28b82; --ok:#81c995; --soft:#222428; } }
  * { box-sizing: border-box; }
  body { margin:0; font:16px/1.5 system-ui, sans-serif; color:var(--fg); background:var(--bg); }
  main { max-width: 760px; margin: 0 auto; padding: 24px 16px 64px; }
  header { display:flex; justify-content:space-between; align-items:center; gap:12px; border-bottom:1px solid var(--line); padding-bottom:12px; margin-bottom:24px; }
  header a { color:var(--fg); text-decoration:none; font-weight:600; }
  .brand { display:flex; align-items:center; gap:10px; } .brand img { width:34px; height:39px; } .brand small { display:block; font-weight:400; color:var(--muted); font-size:.85rem; }
  footer { margin-top:48px; font-size:.85rem; text-align:center; } footer a { color:var(--muted); }
  h1 { font-size:1.6rem; margin:0 0 8px; } h2 { font-size:1.2rem; margin:32px 0 8px; }
  a { color:var(--accent); } .muted { color:var(--muted); }
  label { display:block; font-weight:600; margin:16px 0 4px; } .hint { font-weight:400; color:var(--muted); font-size:.9rem; }
  input[type=text], input[type=url], textarea { width:100%; padding:8px 10px; border:1px solid var(--line); border-radius:6px; font:inherit; background:var(--bg); color:var(--fg); }
  textarea { min-height:80px; font-family: ui-monospace, monospace; font-size:.9rem; }
  button, .button { display:inline-block; padding:8px 16px; border-radius:6px; border:1px solid var(--accent); background:var(--accent); color:var(--bg); font:inherit; font-weight:600; cursor:pointer; text-decoration:none; }
  button.secondary { background:transparent; color:var(--accent); } button.danger { background:var(--warn); border-color:var(--warn); }
  .inline { display:inline; } .row { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-top:16px; }
  table { width:100%; border-collapse:collapse; } td, th { text-align:left; padding:8px 4px; border-bottom:1px solid var(--line); vertical-align:top; }
  code, .mono { font-family: ui-monospace, monospace; font-size:.9rem; overflow-wrap:anywhere; }
  .box { background:var(--soft); border-radius:8px; padding:12px 16px; margin:16px 0; }
  .error { border-left:4px solid var(--warn); } .notice { border-left:4px solid var(--ok); }
  .badge { font-size:.8rem; padding:2px 8px; border-radius:99px; border:1px solid currentColor; } .badge.off { color:var(--warn); } .badge.on { color:var(--ok); }
`);

export function page({ title, user, body }) {
  return html`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · App registration</title><link rel="icon" href="/logo.svg" type="image/svg+xml"><style>${style}</style></head>
<body><main>
<header><a class="brand" href="/"><img src="/logo.svg" alt=""><span>Societal Analytics Lab<small>App registration</small></span></a>
${user
  ? html`<form class="inline" method="post" action="/logout"><span class="muted">${user.email}</span> <button class="secondary">Log out</button></form>`
  : ''}
</header>
${body}
<footer><a href="https://vu.nl/en/about-vu/research-institutes/institute-for-societal-resilience/departments/societal-analytics" rel="noopener">Societal Analytics Lab · VU Amsterdam</a></footer>
</main></body></html>`;
}

const contactLine = () =>
  config.contact ? html`Contact <a href="mailto:${config.contact}">${config.contact}</a>` : 'Contact us';

export function loginPage() {
  return page({
    title: 'Welcome',
    body: html`<h1>Register an app</h1>
<p>Use our login service for your own server or app. Register the app here to get a client ID and secret
for <abbr title="OpenID Connect">OIDC</abbr>, and manage its settings.</p>
<p>Users always see a consent screen before your app gets their name and email address.</p>
<div class="row"><a class="button" href="/login">Log in or create an account</a></div>`,
  });
}

function status(client) {
  return client.enabled ? html`<span class="badge on">active</span>` : html`<span class="badge off">disabled</span>`;
}

export function homePage({ user, apps, canAdd }) {
  return page({
    title: 'Your apps',
    user,
    body: html`<h1>Your apps</h1>
${apps.length
  ? html`<table><tr><th>Name</th><th>Client ID</th><th>Status</th></tr>
      ${apps.map((c) => html`<tr><td><a href="/apps/${c.clientId}">${c.name || c.clientId}</a></td><td class="mono">${c.clientId}</td><td>${status(c)}</td></tr>`)}
    </table>`
  : html`<p class="muted">You haven't registered any apps yet.</p>`}
<div class="row">
${canAdd
  ? html`<a class="button" href="/apps/new">Register a new app</a>`
  : html`<p class="muted">You have reached the limit of ${config.maxAppsPerUser} apps. ${contactLine()} if you need more.</p>`}
</div>`,
  });
}

function settingsFields(s) {
  return html`
<label for="name">Name <span class="hint">shown to users on the login and consent screens</span></label>
<input type="text" id="name" name="name" maxlength="60" required value="${s.name}">
<label for="description">Description <span class="hint">optional</span></label>
<input type="text" id="description" name="description" maxlength="300" value="${s.description}">
<label for="homeUrl">Home page <span class="hint">optional, https://</span></label>
<input type="url" id="homeUrl" name="homeUrl" value="${s.homeUrl}">
<label for="redirectUris">Redirect URIs <span class="hint">one per line; exact URLs, https:// (http:// only for localhost), no wildcards</span></label>
<textarea id="redirectUris" name="redirectUris" required>${s.redirectUris.join('\n')}</textarea>
<label for="logoutUris">Post logout redirect URIs <span class="hint">optional, one per line; if empty, the redirect URIs are allowed</span></label>
<textarea id="logoutUris" name="logoutUris">${s.logoutUris.join('\n')}</textarea>
<label for="logoUri">Logo URL <span class="hint">optional, https://</span></label>
<input type="url" id="logoUri" name="logoUri" value="${s.logoUri}">
<label for="policyUri">Privacy policy URL <span class="hint">optional, https://</span></label>
<input type="url" id="policyUri" name="policyUri" value="${s.policyUri}">
<label for="tosUri">Terms of service URL <span class="hint">optional, https://</span></label>
<input type="url" id="tosUri" name="tosUri" value="${s.tosUri}">`;
}

const errorBox = (error) => (error ? html`<div class="box error">${error}</div>` : '');

export function newAppPage({ user, settings, error }) {
  return page({
    title: 'Register a new app',
    user,
    body: html`<h1>Register a new app</h1>
${errorBox(error)}
<form method="post" action="/apps/new">${settingsFields(settings)}
<div class="row"><button>Register</button><a href="/">Cancel</a></div></form>`,
  });
}

export function appPage({ user, client, settings, secret, error, notice }) {
  const issuer = config.issuer;
  return page({
    title: client.name || client.clientId,
    user,
    body: html`<p><a href="/">← Your apps</a></p>
<h1>${client.name || client.clientId} ${status(client)}</h1>
${errorBox(error)}
${notice ? html`<div class="box notice">${notice}</div>` : ''}
${client.enabled ? '' : html`<div class="box error">This app was disabled by an administrator. ${contactLine()}.</div>`}

<h2>Connection details</h2>
<table>
<tr><th>Issuer</th><td class="mono">${issuer}</td></tr>
<tr><th>Discovery URL</th><td class="mono">${issuer}/.well-known/openid-configuration</td></tr>
<tr><th>Client ID</th><td class="mono">${client.clientId}</td></tr>
<tr><th>Client secret</th><td><details><summary>Show</summary><span class="mono">${secret}</span></details></td></tr>
</table>
<p class="muted">Use the authorization code flow with PKCE (S256), and keep the client secret on your server.
Users are asked to consent before your app receives their data. The <code>amr</code> claim contains
<code>mfa</code> when the user logged in with a second factor.</p>
<p class="muted">The emails our login service sends because of your app (to verify email addresses and reset
passwords) are limited. If your users see "This app has reached its limit": ${contactLine()} for a higher limit.</p>

<h2>Settings</h2>
<form method="post" action="/apps/${client.clientId}">${settingsFields(settings)}
<div class="row"><button>Save</button></div></form>

<h2>Client secret</h2>
<p class="muted">Create a new secret if the current one may have leaked. The old secret stops working immediately.</p>
<form method="post" action="/apps/${client.clientId}/secret"><button class="secondary">Create a new secret</button></form>

<h2>Delete</h2>
<p class="muted">Users can no longer log in to this app. This can't be undone.</p>
<form method="post" action="/apps/${client.clientId}/delete">
<label for="confirm">Type the client ID <span class="mono">${client.clientId}</span> to confirm</label>
<input type="text" id="confirm" name="confirm" autocomplete="off" required>
<div class="row"><button class="danger">Delete app</button></div></form>`,
  });
}

export function errorPage({ user, status, message }) {
  return page({
    title: 'Error',
    user,
    body: html`<h1>${status === 404 ? 'Not found' : 'Something went wrong'}</h1><p>${message}</p><p><a href="/">Back</a></p>`,
  });
}

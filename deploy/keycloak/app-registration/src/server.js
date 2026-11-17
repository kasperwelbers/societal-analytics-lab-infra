// App registration site: users log in with the idp realm, register apps (OIDC clients) and
// manage their settings. See docs/app-registration.md.

import crypto from 'node:crypto';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { serve } from '@hono/node-server';
import { csrf } from 'hono/csrf';
import { secureHeaders } from 'hono/secure-headers';
import { getSignedCookie, setSignedCookie, deleteCookie } from 'hono/cookie';
import * as oidc from 'openid-client';

import { config, publicKeycloakOrigin } from './config.js';
import * as kc from './keycloak.js';
import { ValidationError, applySettings, isOwner, newClient, parseForm, settingsOf } from './apps.js';
import * as views from './views.js';

const SESSION = '__Host-session';
const LOGIN = '__Host-login';
const SESSION_HOURS = 8;
const cookieOptions = { httpOnly: true, secure: true, sameSite: 'Lax', path: '/' };

// --- OIDC (server-side authorization code flow with PKCE) ----------------------------------

const oidcConfig = await oidc.discovery(new URL(config.issuer), config.clientId, config.clientSecret, undefined, {
  [oidc.customFetch]: kc.internalFetch,
});
oidcConfig[oidc.customFetch] = kc.internalFetch;
const callbackUrl = `${config.publicUrl}/callback`;

async function getUser(c) {
  const raw = await getSignedCookie(c, config.sessionSecret, SESSION);
  if (!raw) return null;
  try {
    const user = JSON.parse(Buffer.from(raw, 'base64url').toString());
    return user.exp > Date.now() ? user : null;
  } catch {
    return null;
  }
}

async function setUser(c, claims) {
  const user = { sub: claims.sub, email: claims.email, exp: Date.now() + SESSION_HOURS * 3600_000 };
  const value = Buffer.from(JSON.stringify(user)).toString('base64url');
  await setSignedCookie(c, SESSION, value, config.sessionSecret, { ...cookieOptions, maxAge: SESSION_HOURS * 3600 });
}

// --- App -------------------------------------------------------------------------------------

const app = new Hono();

app.use(
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'none'"],
      styleSrc: ["'unsafe-inline'"],
      imgSrc: ["'self'"],
      formAction: ["'self'", publicKeycloakOrigin],
      frameAncestors: ["'none'"],
      baseUri: ["'none'"],
    },
  }),
);
// Form posts must come from this site (on top of SameSite cookies)
app.use(csrf({ origin: config.publicUrl }));

app.get('/healthz', (c) => c.text('ok'));
app.get('/logo.svg', (c) => c.body(views.logoSvg, 200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' }));

app.get('/login', async (c) => {
  const login = {
    state: oidc.randomState(),
    nonce: oidc.randomNonce(),
    verifier: oidc.randomPKCECodeVerifier(),
  };
  await setSignedCookie(c, LOGIN, Buffer.from(JSON.stringify(login)).toString('base64url'), config.sessionSecret, {
    ...cookieOptions,
    maxAge: 15 * 60,
  });
  const url = oidc.buildAuthorizationUrl(oidcConfig, {
    redirect_uri: callbackUrl,
    scope: 'openid email profile',
    state: login.state,
    nonce: login.nonce,
    code_challenge: await oidc.calculatePKCECodeChallenge(login.verifier),
    code_challenge_method: 'S256',
  });
  return c.redirect(url.href);
});

app.get('/callback', async (c) => {
  const raw = await getSignedCookie(c, config.sessionSecret, LOGIN);
  deleteCookie(c, LOGIN, cookieOptions);
  if (!raw) return c.redirect('/');
  const login = JSON.parse(Buffer.from(raw, 'base64url').toString());
  const current = new URL(callbackUrl);
  current.search = new URL(c.req.url).search;
  let claims;
  try {
    const tokens = await oidc.authorizationCodeGrant(oidcConfig, current, {
      pkceCodeVerifier: login.verifier,
      expectedState: login.state,
      expectedNonce: login.nonce,
    });
    claims = tokens.claims();
  } catch (err) {
    console.error(`login failed: ${err.message}`);
    return c.html(views.errorPage({ status: 400, message: 'Logging in failed. Please try again.' }), 400);
  }
  if (claims.email_verified !== true) {
    return c.html(views.errorPage({ status: 403, message: 'Please verify your email address first.' }), 403);
  }
  await setUser(c, claims);
  return c.redirect('/');
});

app.post('/logout', async (c) => {
  deleteCookie(c, SESSION, cookieOptions);
  const url = oidc.buildEndSessionUrl(oidcConfig, {
    client_id: config.clientId,
    post_logout_redirect_uri: `${config.publicUrl}/`,
  });
  return c.redirect(url.href, 303);
});

// Everything below requires a logged in user
app.use('*', async (c, next) => {
  const user = await getUser(c);
  if (!user) return c.req.method === 'GET' && c.req.path === '/' ? c.html(views.loginPage()) : c.redirect('/');
  c.set('user', user);
  await next();
});

const ownedApps = async (user) => (await kc.listClients()).filter((client) => isOwner(client, user));

app.get('/', async (c) => {
  const user = c.get('user');
  const apps = await ownedApps(user);
  return c.html(views.homePage({ user, apps, canAdd: apps.length < config.maxAppsPerUser }));
});

app.get('/apps/new', async (c) => {
  const user = c.get('user');
  if ((await ownedApps(user)).length >= config.maxAppsPerUser) return c.redirect('/');
  const settings = { name: '', description: '', homeUrl: '', redirectUris: [], logoutUris: [], logoUri: '', policyUri: '', tosUri: '' };
  return c.html(views.newAppPage({ user, settings }));
});

app.post('/apps/new', async (c) => {
  const user = c.get('user');
  const form = await c.req.parseBody();
  if ((await ownedApps(user)).length >= config.maxAppsPerUser) return c.redirect('/');
  let settings;
  try {
    settings = parseForm(form);
    const client = newClient(settings, user);
    await kc.createClient(client);
    console.log(`registered ${client.clientId} for user ${user.sub}`);
    return c.redirect(`/apps/${client.clientId}?notice=created`, 303);
  } catch (err) {
    if (!(err instanceof ValidationError || (err instanceof kc.KeycloakError && err.status === 400))) throw err;
    const shown = settings || formAsSettings(form);
    return c.html(views.newAppPage({ user, settings: shown, error: err.message }), 400);
  }
});

// Echo the submitted form back after a validation error
function formAsSettings(form) {
  const list = (v) => String(v ?? '').split(/\s+/).filter(Boolean);
  const str = (v) => String(v ?? '');
  return {
    name: str(form.name), description: str(form.description), homeUrl: str(form.homeUrl),
    redirectUris: list(form.redirectUris), logoutUris: list(form.logoutUris),
    logoUri: str(form.logoUri), policyUri: str(form.policyUri), tosUri: str(form.tosUri),
  };
}

// The app with this client ID, if the user owns it
async function ownedApp(c) {
  const client = await kc.getClient(c.req.param('clientId'));
  return client && isOwner(client, c.get('user')) ? client : null;
}

const NOTICES = {
  created: 'Your app is registered. Use the connection details below to set up your server.',
  saved: 'Settings saved.',
  secret: 'A new client secret was created. Update it on your server.',
};

async function renderApp(c, client, { settings, error, status = 200 } = {}) {
  const secret = await kc.getClientSecret(client);
  return c.html(
    views.appPage({
      user: c.get('user'),
      client,
      settings: settings || settingsOf(client),
      secret,
      error,
      notice: NOTICES[c.req.query('notice')],
    }),
    status,
  );
}

app.get('/apps/:clientId', async (c) => {
  const client = await ownedApp(c);
  if (!client) return c.notFound();
  return renderApp(c, client);
});

app.post('/apps/:clientId', async (c) => {
  const client = await ownedApp(c);
  if (!client) return c.notFound();
  const form = await c.req.parseBody();
  try {
    await kc.updateClient(applySettings(client, parseForm(form)));
    return c.redirect(`/apps/${client.clientId}?notice=saved`, 303);
  } catch (err) {
    if (!(err instanceof ValidationError || (err instanceof kc.KeycloakError && err.status === 400))) throw err;
    const fresh = await kc.getClient(client.clientId);
    return renderApp(c, fresh, { settings: formAsSettings(form), error: err.message, status: 400 });
  }
});

app.post('/apps/:clientId/secret', async (c) => {
  const client = await ownedApp(c);
  if (!client) return c.notFound();
  await kc.regenerateClientSecret(client);
  console.log(`new secret for ${client.clientId} by user ${c.get('user').sub}`);
  return c.redirect(`/apps/${client.clientId}?notice=secret`, 303);
});

app.post('/apps/:clientId/delete', async (c) => {
  const client = await ownedApp(c);
  if (!client) return c.notFound();
  const { confirm } = await c.req.parseBody();
  if (String(confirm ?? '').trim() !== client.clientId) {
    return renderApp(c, client, { error: 'Type the client ID to confirm deleting the app.', status: 400 });
  }
  await kc.deleteClient(client);
  console.log(`deleted ${client.clientId} by user ${c.get('user').sub}`);
  return c.redirect('/', 303);
});

app.notFound((c) => c.html(views.errorPage({ status: 404, message: 'This page does not exist, or this app is not yours.' }), 404));

app.onError((err, c) => {
  // e.g. 403 from the CSRF check
  if (err instanceof HTTPException) return err.getResponse();
  const id = crypto.randomBytes(4).toString('hex');
  console.error(`error ${id}: ${err.stack || err.message}`);
  return c.html(views.errorPage({ status: 500, message: `Please try again later (error ${id}).` }), 500);
});

serve({ fetch: app.fetch, port: config.port }, () => console.log(`app registration listening on port ${config.port}`));

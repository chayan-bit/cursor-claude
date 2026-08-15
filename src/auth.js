// OAuth login, token storage, and automatic refresh for the Claude
// subscription (Pro/Max) via the public Claude Code OAuth client.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { OAUTH, CREDENTIALS_PATH } from './config.js';
import { createPkce } from './pkce.js';

// Refresh a bit early so an in-flight request never uses an expired token.
const EXPIRY_SKEW_MS = 60_000;

let cache = null; // in-memory copy of the last read/written credentials

/** Build the authorize URL the user opens in a browser. */
export function buildAuthUrl() {
  const { verifier, challenge, state } = createPkce();
  const url = new URL(OAUTH.authorizeUrl);
  url.searchParams.set('code', 'true');
  url.searchParams.set('client_id', OAUTH.clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', OAUTH.redirectUri);
  url.searchParams.set('scope', OAUTH.scopes.join(' '));
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', state);
  return { url: url.toString(), verifier, state };
}

/**
 * Exchange the pasted authorization code for tokens.
 * The manual flow returns the code as "<code>#<state>".
 */
export async function exchangeCode(rawCode, verifier, expectedState) {
  const [code, returnedState] = String(rawCode).trim().split('#');
  const body = {
    grant_type: 'authorization_code',
    code,
    // Anthropic echoes state back in the pasted code; forward whichever exists.
    state: returnedState || expectedState,
    client_id: OAUTH.clientId,
    redirect_uri: OAUTH.redirectUri,
    code_verifier: verifier,
  };
  const res = await fetch(OAUTH.tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(
      `Token exchange failed (${res.status}): ${await res.text()}`,
    );
  }
  return persist(await res.json());
}

/** Refresh an expired access token. */
async function refresh(refreshToken) {
  const res = await fetch(OAUTH.tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: OAUTH.clientId,
    }),
  });
  if (!res.ok) {
    throw new Error(`Token refresh failed (${res.status}): ${await res.text()}`);
  }
  return persist(await res.json());
}

/** Normalize a token response and write it to disk. */
async function persist(tokenResponse) {
  const creds = {
    access_token: tokenResponse.access_token,
    refresh_token: tokenResponse.refresh_token,
    expires_at: Date.now() + (tokenResponse.expires_in ?? 0) * 1000,
    scope: tokenResponse.scope,
    obtained_at: Date.now(),
  };
  await mkdir(dirname(CREDENTIALS_PATH), { recursive: true });
  await writeFile(CREDENTIALS_PATH, JSON.stringify(creds, null, 2), {
    mode: 0o600,
  });
  cache = creds;
  return creds;
}

async function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(await readFile(CREDENTIALS_PATH, 'utf8'));
    return cache;
  } catch {
    return null;
  }
}

/**
 * Return a valid access token, refreshing transparently if needed.
 * Throws if the user has never logged in.
 */
export async function getAccessToken() {
  const creds = await load();
  if (!creds || !creds.access_token) {
    throw new Error('Not logged in. Run: cursor-claude login');
  }
  if (Date.now() >= creds.expires_at - EXPIRY_SKEW_MS) {
    if (!creds.refresh_token) {
      throw new Error('Access token expired and no refresh token. Re-login.');
    }
    const refreshed = await refresh(creds.refresh_token);
    return refreshed.access_token;
  }
  return creds.access_token;
}

export async function status() {
  const creds = await load();
  if (!creds) return { loggedIn: false };
  return {
    loggedIn: true,
    expiresAt: new Date(creds.expires_at).toISOString(),
    expired: Date.now() >= creds.expires_at,
    scope: creds.scope,
    path: CREDENTIALS_PATH,
  };
}

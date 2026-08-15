// Central configuration and well-known Claude Code OAuth constants.
//
// These OAuth client constants are the public identifiers used by Anthropic's
// first-party Claude Code CLI. Using them lets a Claude Pro/Max subscription
// authenticate against the Messages API without a per-token API key.
import { homedir } from 'node:os';
import { join } from 'node:path';

// --- Claude Code OAuth (public client) ---
export const OAUTH = {
  clientId: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
  authorizeUrl: 'https://claude.ai/oauth/authorize',
  tokenUrl: 'https://console.anthropic.com/v1/oauth/token',
  // Manual "paste the code" redirect used by the CLI login flow.
  redirectUri: 'https://console.anthropic.com/oauth/code/callback',
  scopes: ['org:create_api_key', 'user:profile', 'user:inference'],
};

// --- Upstream Anthropic API ---
export const ANTHROPIC = {
  baseUrl: 'https://api.anthropic.com',
  version: '2023-06-01',
  // Required beta flag that permits OAuth bearer auth on the Messages API.
  betaOAuth: 'oauth-2025-04-20',
  // Anthropic requires the OAuth caller to identify as Claude Code: the first
  // system block must be exactly this string, or the request is rejected.
  claudeCodeIdentity:
    "You are Claude Code, Anthropic's official CLI for Claude.",
};

// --- Local server ---
export const SERVER = {
  port: Number(process.env.PORT || 8787),
  host: process.env.HOST || '127.0.0.1',
  // Optional shared secret Cursor must present. Empty => accept any key.
  apiKey: process.env.PROXY_API_KEY || '',
};

// --- Credentials storage ---
export const CREDENTIALS_PATH =
  process.env.CREDENTIALS_PATH ||
  join(homedir(), '.cursor-claude', 'credentials.json');

// Models advertised to Cursor via GET /v1/models. The proxy forwards whatever
// model id it receives, so this list is purely for discovery/UX. Edit freely.
export const MODELS = [
  'claude-opus-4-1-20250805',
  'claude-opus-4-20250514',
  'claude-sonnet-4-20250514',
  'claude-3-7-sonnet-20250219',
  'claude-3-5-sonnet-20241022',
  'claude-3-5-haiku-20241022',
];

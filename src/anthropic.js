// Upstream calls to the Anthropic Messages API using an OAuth bearer token.
//
// Two rules make subscription OAuth work on the Messages API:
//   1. Send "anthropic-beta: oauth-2025-04-20" and NO x-api-key header.
//   2. The first system block must identify the caller as Claude Code.
import { ANTHROPIC } from './config.js';
import { getAccessToken } from './auth.js';

/**
 * Ensure the request body carries the Claude Code identity as its first
 * system block. Accepts a string, an array, or undefined system field and
 * returns a normalized array with the identity prepended (deduped).
 */
export function injectClaudeCodeIdentity(body) {
  const identity = { type: 'text', text: ANTHROPIC.claudeCodeIdentity };
  let system = body.system;

  if (system == null) {
    system = [identity];
  } else if (typeof system === 'string') {
    system =
      system.trim() === ANTHROPIC.claudeCodeIdentity
        ? [identity]
        : [identity, { type: 'text', text: system }];
  } else if (Array.isArray(system)) {
    const first = system[0];
    const firstText = typeof first === 'string' ? first : first?.text;
    system =
      firstText === ANTHROPIC.claudeCodeIdentity
        ? system.map((s) => (typeof s === 'string' ? { type: 'text', text: s } : s))
        : [identity, ...system.map((s) => (typeof s === 'string' ? { type: 'text', text: s } : s))];
  } else {
    system = [identity];
  }
  return { ...body, system };
}

/** Fire a Messages API request. Returns the raw fetch Response (streamable). */
export async function callMessages(body) {
  const token = await getAccessToken();
  const payload = injectClaudeCodeIdentity(body);
  return fetch(`${ANTHROPIC.baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      'anthropic-version': ANTHROPIC.version,
      'anthropic-beta': ANTHROPIC.betaOAuth,
    },
    body: JSON.stringify(payload),
  });
}

// PKCE (RFC 7636) helpers for the OAuth Authorization Code flow.
import { randomBytes, createHash } from 'node:crypto';

function base64url(buf) {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function createPkce() {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  const state = base64url(randomBytes(32));
  return { verifier, challenge, state };
}

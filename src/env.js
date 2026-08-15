// Minimal zero-dependency .env loader. Loads KEY=VALUE lines into process.env
// without overwriting values already present in the environment.
import { readFileSync } from 'node:fs';

export function loadEnv(path = '.env') {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return; // no .env file is fine
  }
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

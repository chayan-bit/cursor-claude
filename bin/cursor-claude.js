#!/usr/bin/env node
// cursor-claude CLI: login | start | status
// Env is loaded before any module that reads process.env is imported.
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { loadEnv } from '../src/env.js';

loadEnv();

const cmd = process.argv[2];

async function login() {
  const { buildAuthUrl, exchangeCode } = await import('../src/auth.js');
  const { url, verifier, state } = buildAuthUrl();

  console.log('\nOpen this URL in your browser and approve access:\n');
  console.log('  ' + url + '\n');
  console.log(
    'After approving, Anthropic shows an authorization code.\n' +
      'Copy the ENTIRE code (it may look like "abc...#xyz...") and paste it below.\n',
  );

  const rl = createInterface({ input: stdin, output: stdout });
  const code = await rl.question('Authorization code: ');
  rl.close();

  try {
    const creds = await exchangeCode(code, verifier, state);
    console.log(
      `\nLogged in. Token valid until ${new Date(creds.expires_at).toISOString()}.`,
    );
    console.log('Start the proxy with: cursor-claude start');
  } catch (e) {
    console.error('\nLogin failed:', e.message);
    process.exit(1);
  }
}

async function start() {
  const { startServer } = await import('../src/server.js');
  startServer();
}

async function status() {
  const { status: getStatus } = await import('../src/auth.js');
  console.log(JSON.stringify(await getStatus(), null, 2));
}

function usage() {
  console.log(
    'cursor-claude <command>\n\n' +
      '  login    Authenticate with your Anthropic (Claude Pro/Max) subscription\n' +
      '  start    Run the local proxy for Cursor\n' +
      '  status   Show login/token status\n',
  );
}

switch (cmd) {
  case 'login':
    await login();
    break;
  case 'start':
    await start();
    break;
  case 'status':
    await status();
    break;
  default:
    usage();
    if (cmd) process.exit(1);
}

// Local HTTP proxy. Exposes both an OpenAI-compatible surface (for Cursor's
// "Override OpenAI Base URL") and a native Anthropic passthrough.
import { createServer } from 'node:http';
import { SERVER, MODELS, ANTHROPIC } from './config.js';
import { callMessages, injectClaudeCodeIdentity } from './anthropic.js';
import { getAccessToken } from './auth.js';
import {
  openaiToAnthropic,
  anthropicToOpenai,
  translateStream,
} from './translate.js';

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(res, status, obj) {
  const data = JSON.stringify(obj);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(data),
  });
  res.end(data);
}

function sendError(res, status, message, type = 'proxy_error') {
  sendJson(res, status, { error: { message, type } });
}

// Enforce the optional shared secret. Returns true if the request may proceed.
function authorized(req) {
  if (!SERVER.apiKey) return true;
  const auth = req.headers['authorization'] || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const xkey = req.headers['x-api-key'] || '';
  return bearer === SERVER.apiKey || xkey === SERVER.apiKey;
}

async function streamOpenai(res, upstream, model) {
  res.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });
  for await (const chunk of translateStream(upstream.body, model)) {
    res.write(chunk);
  }
  res.end();
}

async function handleChatCompletions(req, res) {
  const body = JSON.parse(await readBody(req));
  const anthropicBody = openaiToAnthropic(body);
  const upstream = await callMessages(anthropicBody);

  if (!upstream.ok) {
    return sendError(
      res,
      upstream.status,
      await upstream.text(),
      'upstream_error',
    );
  }
  if (anthropicBody.stream) {
    return streamOpenai(res, upstream, body.model);
  }
  const json = await upstream.json();
  return sendJson(res, 200, anthropicToOpenai(json, body.model));
}

async function handleMessages(req, res) {
  const body = JSON.parse(await readBody(req));
  const upstream = await callMessages(body); // identity injected inside
  if (!upstream.ok) {
    return sendError(
      res,
      upstream.status,
      await upstream.text(),
      'upstream_error',
    );
  }
  if (body.stream) {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    for await (const chunk of upstream.body) res.write(chunk);
    return res.end();
  }
  return sendJson(res, 200, await upstream.json());
}

function handleModels(res) {
  sendJson(res, 200, {
    object: 'list',
    data: MODELS.map((id) => ({
      id,
      object: 'model',
      created: 0,
      owned_by: 'anthropic',
    })),
  });
}

export function startServer() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const path = url.pathname;

      if (req.method === 'GET' && path === '/health') {
        return sendJson(res, 200, { ok: true, service: 'cursor-claude' });
      }
      if (req.method === 'GET' && (path === '/v1/models' || path === '/models')) {
        return handleModels(res);
      }
      if (!authorized(req)) {
        return sendError(res, 401, 'Invalid proxy API key', 'unauthorized');
      }
      // Fail fast with a clear message if the user never logged in.
      try {
        await getAccessToken();
      } catch (e) {
        return sendError(res, 401, e.message, 'not_logged_in');
      }

      if (req.method === 'POST' && path === '/v1/chat/completions') {
        return await handleChatCompletions(req, res);
      }
      if (req.method === 'POST' && (path === '/v1/messages' || path === '/messages')) {
        return await handleMessages(req, res);
      }
      return sendError(res, 404, `No route for ${req.method} ${path}`, 'not_found');
    } catch (err) {
      return sendError(res, 500, err?.message || String(err));
    }
  });

  server.listen(SERVER.port, SERVER.host, () => {
    const base = `http://${SERVER.host}:${SERVER.port}`;
    console.log(`cursor-claude proxy listening on ${base}`);
    console.log(`  OpenAI base URL for Cursor : ${base}/v1`);
    console.log(`  Anthropic base URL         : ${base}`);
    console.log(
      `  Auth: ${SERVER.apiKey ? 'shared key required' : 'open (localhost)'}` +
        ` | upstream beta: ${ANTHROPIC.betaOAuth}`,
    );
  });
  return server;
}

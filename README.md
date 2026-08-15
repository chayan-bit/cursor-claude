# cursor-claude

Use your **Anthropic Claude subscription (Pro / Max)** inside **Cursor** - the
same authentication method [Claude Code](https://docs.anthropic.com/en/docs/claude-code)
(and the `omp` agent runtime) uses. No per-token API key, no console billing.

`cursor-claude` is a tiny, zero-dependency local proxy. It logs in once with the
Claude Code OAuth flow, stores the resulting subscription token, and exposes:

- an **OpenAI-compatible** endpoint (`/v1/chat/completions`, `/v1/models`) so
  Cursor's "Override OpenAI Base URL" points straight at it, and
- a native **Anthropic passthrough** (`/v1/messages`) for any tool that lets you
  override the Anthropic base URL.

Every upstream request is signed with your OAuth token and the two flags that
make subscription auth work: the `oauth-2025-04-20` beta header and the required
Claude Code system identity.

---

## Warning (read this)

This uses your **personal Claude subscription** through a non-official client.
That very likely **violates Anthropic's Terms of Service** and could get your
account rate-limited or **banned**. This project is for personal
experimentation. You accept all risk. Do not use it for production or resale.

---

## Requirements

- Node.js >= 18 (uses built-in `fetch`, `crypto`, `http` - no npm install)
- An active Claude **Pro** or **Max** subscription

## Install

```bash
git clone git@github.com:chayan-bit/cursor-claude.git
cd cursor-claude
# optional: cp .env.example .env  and edit
```

## 1. Log in (once)

```bash
node bin/cursor-claude.js login
# or: npm run login
```

It prints an authorization URL. Open it, approve access, copy the authorization
code Anthropic shows you (it may look like `abc...#xyz...` - copy the whole
thing), and paste it back. Tokens are saved to
`~/.cursor-claude/credentials.json` (chmod 600) and auto-refresh from then on.

Check status any time:

```bash
node bin/cursor-claude.js status
```

## 2. Start the proxy

```bash
node bin/cursor-claude.js start
# cursor-claude proxy listening on http://127.0.0.1:8787
#   OpenAI base URL for Cursor : http://127.0.0.1:8787/v1
#   Anthropic base URL         : http://127.0.0.1:8787
```

Keep this running (a terminal tab, `tmux`, or a launchd/systemd service).

## 3. Point Cursor at it

Cursor lets you override the OpenAI base URL, which is the reliable way to inject
a proxy.

1. Cursor -> **Settings** -> **Models** (or **Cursor Settings -> Models**).
2. Scroll to **OpenAI API Key**. Enter any non-empty string as the key
   (e.g. `cursor-claude`). If you set `PROXY_API_KEY` in `.env`, use that exact
   value here.
3. Enable **Override OpenAI Base URL** and set it to:
   ```
   http://127.0.0.1:8787/v1
   ```
4. Under **Models**, add a custom model whose name matches an Anthropic model id,
   e.g. `claude-sonnet-4-20250514` or `claude-opus-4-1-20250805`
   (see `GET http://127.0.0.1:8787/v1/models` for the advertised list).
5. Click **Verify** / save. Select your custom Claude model in the chat model
   picker.

> Cursor's Agent/Composer features work best with OpenAI-style custom models.
> Some advanced Cursor features are gated to its first-party models and may be
> unavailable regardless of provider.

## Configuration (`.env`)

| Variable          | Default          | Purpose                                             |
| ----------------- | ---------------- | --------------------------------------------------- |
| `PORT`            | `8787`           | Proxy listen port                                   |
| `HOST`            | `127.0.0.1`      | Bind address (keep local)                           |
| `PROXY_API_KEY`   | _(empty)_        | If set, Cursor must send it as the API key          |
| `CREDENTIALS_PATH`| `~/.cursor-claude/credentials.json` | Token storage location           |

## How it works

```
Cursor  --OpenAI /v1/chat/completions-->  cursor-claude  --OAuth Bearer-->  api.anthropic.com/v1/messages
             (any dummy key)                   |  translates shapes both ways
                                               |  injects: anthropic-beta: oauth-2025-04-20
                                               |           system[0] = "You are Claude Code..."
                                               |  refreshes the subscription token automatically
```

- `src/auth.js` - PKCE OAuth login, token storage, transparent refresh
- `src/anthropic.js` - upstream call + Claude Code identity injection
- `src/translate.js` - OpenAI <-> Anthropic request/response + SSE streaming
- `src/server.js` - the HTTP proxy (OpenAI compat + Anthropic passthrough)
- `src/config.js` - OAuth constants, model list, server config

## Endpoints

| Method | Path                    | Shape     | Notes                          |
| ------ | ----------------------- | --------- | ------------------------------ |
| GET    | `/health`               | -         | liveness                       |
| GET    | `/v1/models`            | OpenAI    | advertised model ids           |
| POST   | `/v1/chat/completions`  | OpenAI    | streaming + non-streaming      |
| POST   | `/v1/messages`          | Anthropic | native passthrough             |

## Troubleshooting

- **401 `not_logged_in`** - run `login` again; token may have been revoked.
- **401/403 from upstream** - Anthropic may have changed OAuth requirements, or
  the model id is not available to your plan.
- **Cursor "verify" fails** - confirm the base URL ends in `/v1` and the proxy
  is running (`curl http://127.0.0.1:8787/v1/models`).

## License

MIT. See [LICENSE](./LICENSE).

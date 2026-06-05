---
name: vera-server-login
description: Login to Vera Cowork Server from Letta Code using email OTP, cache tokens locally, and expose them as shell environment variables.
---

# Vera Server Login

Use this skill when the user wants Letta Code to authenticate with Vera Cowork Server as a real user using email OTP.

## Security rules

- Never ask the user to paste an access token or refresh token into chat.
- Never print token values unless the user explicitly asks for shell exports.
- Never store tokens in agent memory, markdown notes, git, or source files.
- Use the helper script so tokens are cached in a local private file with `chmod 600`.
- Prefer `source ~/.letta-cowork/vera-auth.env` in a shell over writing tokens into project `.env` files.

## Login flow

IMPORTANT: run the interactive login command in a real user terminal, not inside a Letta Code tool/shell cell.

Letta Code's Bash/tool shell is noninteractive. If this script is run there, the email/OTP prompts can be captured inside the agent session instead of opening a terminal prompt for the user. For OTP login, tell the user to open macOS Terminal/iTerm/PowerShell/etc. and run the command themselves.

For the global install, run from a normal terminal:

```bash
~/.letta/skills/vera-server-login/scripts/vera-login.mjs
```

For a repo-local install, run from the repo root:

```bash
skills/vera-server-login/scripts/vera-login.mjs
```

The script will:

1. Ask for Vera email, unless `VERA_EMAIL` is already set.
2. Call `POST /auth/otp/request`.
3. Ask for the six-digit OTP.
4. Call `POST /auth/otp/verify`.
5. Save tokens to `~/.letta-cowork/vera-auth.json` with mode `600`.
6. Save shell exports to `~/.letta-cowork/vera-auth.env` with mode `600`.

Then the user can run:

```bash
source ~/.letta-cowork/vera-auth.env
```

Available env vars after sourcing:

```bash
VERA_SERVER_URL
VERA_ACCESS_TOKEN
VERA_REFRESH_TOKEN
VERA_ACCESS_TOKEN_EXPIRES_AT
VERA_USER_ID
VERA_USER_EMAIL
VERA_ORGANIZATION_ID
```

## Server URL

Default:

```bash
https://vera-cowork-server.ngrok.app
```

Override:

```bash
VERA_SERVER_URL="https://your-vera-server" skills/vera-server-login/scripts/vera-login.mjs
```

or:

```bash
skills/vera-server-login/scripts/vera-login.mjs --server-url "https://your-vera-server"
```

## Refresh token

Run from a normal terminal, not a Letta Code tool/shell cell:

```bash
~/.letta/skills/vera-server-login/scripts/vera-login.mjs --refresh
source ~/.letta-cowork/vera-auth.env
```

The script uses `VERA_REFRESH_TOKEN` if set, otherwise it reads the cached refresh token from `~/.letta-cowork/vera-auth.json`.

## One-shot shell exports

Only when needed, use from a normal terminal:

```bash
~/.letta/skills/vera-server-login/scripts/vera-login.mjs --print-exports
```

This prints export statements containing tokens. Avoid logging or copying this output.

## Vera API usage after login

Example:

```bash
curl -sS \
  -H "Authorization: Bearer $VERA_ACCESS_TOKEN" \
  "$VERA_SERVER_URL/auth/me"
```

Example Odoo read call:

```bash
curl -sS -X POST "$VERA_SERVER_URL/odoo/models/search" \
  -H "Authorization: Bearer $VERA_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model":"sale.order","domain":[],"fields":["id","name"],"limit":5}'
```

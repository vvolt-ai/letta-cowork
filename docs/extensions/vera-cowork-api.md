# Vera Cowork API Letta Code Extension

Trusted local runtime extension for Letta Code / Vera Cowork. It registers client tools that call Vera Cowork Server with the local cached login token.

## Source

```text
extensions/vera-cowork-api.mjs
```

## Runtime install path

Cowork loads runtime extensions from `~/.letta/extensions` by default when extensions are enabled.

Installed copy:

```text
~/.letta/extensions/vera-cowork-api.mjs
```

## Enable extensions

Set this before starting Letta Code / Vera Cowork:

```bash
export COWORK_EXTENSIONS_ENABLED=true
```

Optional if you want to load directly from this repo instead of `~/.letta/extensions`:

```bash
export COWORK_EXTENSIONS_DIR=/Users/niralsakariya/Desktop/vv/new/letta-cowork/extensions
```

## Default Vera server

```text
https://vera-cowork-server.ngrok.app
```

Override with one of:

```bash
export COWORK_SERVER_URL=https://vera-cowork-server.ngrok.app
export VERA_SERVER_URL=https://vera-cowork-server.ngrok.app
export VERA_COWORK_API_URL=https://vera-cowork-server.ngrok.app
```

## Auth sources

The extension never asks for, prints, or stores token values. It reads tokens in this order:

1. `COWORK_TOKEN`
2. `VERA_ACCESS_TOKEN`
3. `~/.letta-cowork/.cowork-token`
4. `~/.letta-cowork/vera-auth.json` (`accessToken`)

Use the existing `vera-server-login` skill/script to create the token cache.

## Command usage

A command wrapper is available at:

```text
bin/vera-cowork.mjs
```

Installed symlink:

```text
~/.local/bin/vera-cowork
```

Use it as:

```bash
vera-cowork status --verify
vera-cowork login
vera-cowork get /auth/me
vera-cowork get /channels '{"limit":10}'
vera-cowork post /odoo/models/search '{"model":"res.partner","domain":[],"limit":5}'
vera-cowork install-extension
```

If `~/.local/bin` is not in PATH, either add it:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

or run directly:

```bash
~/.local/bin/vera-cowork status
```

The command never prints token values.

## Registered tools

- `vera_auth_status` — check token presence and optionally verify with `/auth/me`; returns metadata only, never token values.
- `vera_login_instructions` — safe login instructions for the user.
- `vera_api_get` — authenticated GET.
- `vera_api_post` — authenticated POST.
- `vera_api_put` — authenticated PUT.
- `vera_api_patch` — authenticated PATCH.
- `vera_api_delete` — authenticated DELETE; destructive, use only with explicit user instruction.

## Example tool use intent

```text
Use vera_auth_status with verify=true.
Use vera_api_get path=/channels.
Use vera_api_post path=/odoo/models/search body={...}.
```

## Security rules

- Never print tokens.
- Do not paste tokens into chat.
- Use write/delete tools only when the user explicitly asks for a write/destructive action.
- The extension refuses absolute URLs outside the configured Vera origin.

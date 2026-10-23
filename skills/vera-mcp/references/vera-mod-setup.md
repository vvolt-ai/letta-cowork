# Vera mod — download, install and connect

Use only for an actual **Letta Code** integration request or when the Vera mod is genuinely missing. Source checked 2026-10-14: maintained mod `README.md`, `MOD.md` and package directory in `vvolt-ai/letta-cowork/mods/letta-code-vera`. The active installed version's instructions/schema are authoritative; no installation, live authorization or guest-access grant is implied by this guide.

## Choose the right recovery

| Current context / symptom | Next action |
|---|---|
| Vera web user is signed out | Use the approved web sign-in interface; do not install a CLI mod. |
| Cowork desktop needs login | Use its approved Vera connection/sign-in UI; do not ask for browser token plaintext. |
| Letta Code mod installed, session expired/disconnected | Recover the existing connection with `/vera-connect`; do not reinstall routinely. |
| Letta Code mod absent / commands unavailable | Obtain the approved package and installation approval, then follow below. |
| Server/channel/MCP-only runtime | Use mounted authorized tools; a local mod installation is not assumed or a substitute for permissions. |
| Connected but no resource/tools visible | Check correct principal/workspace and authorized discovery. Catalog counts are not permission or runner readiness. |
| 403, missing sharing/membership or offline machine | Report that specific restriction; login/reinstall does not fix it. |
| Person has no eligible Vera account/workspace | Ask the responsible administrator for the approved invitation/account route. Do not invent open signup, create memberships automatically or grant internal guest tools. |

## 1. Obtain the approved package

Maintained source: [Vera mod directory](https://github.com/vvolt-ai/letta-cowork/tree/main/mods/letta-code-vera). Use a trusted, owner-approved distribution for the user's platform/version. The repository may require authenticated team access; a public 404 is not proof the package is missing, and a Vera login does not grant repository access.

Prefer a maintainer-provided verified unpacked package/archive containing `package.json`, `MOD.md`, and the required mod/source files. Verify the publisher/version and provided integrity information where available. Do not invent a public download/release URL, copy another user's credentials, download from an arbitrary mirror, or give guests broad private production-repository access merely to install a mod. If no authorized distribution is accessible, ask the administrator for the approved installer/package; do not request tokens in chat.

No automatic install/reinstall: obtain the user's approval before modifying their machine. Preserve existing mod configuration and session state. Use an available authorized machine/local tool only on the exact approved target; do not assume this conversation's filesystem is the user's PC.

## 2. Install and activate locally

The inspected package requires **Letta Code CLI/Desktop >=0.28.0**. Check locally:

```text
letta --version
```

If unsupported, follow the approved CLI upgrade procedure with its own authorization. Do not claim older CLIs support the installer or guess an upgrade command.

From the actual approved extracted package directory:

```text
cd "<approved-package-directory>"
letta install .
```

Then in the already-running Letta Code session:

```text
/reload
```

Check that the Vera mod and `/vera-status` command activate. Do not claim installed/loaded from a downloaded archive or successful package copy alone. Do not replace this supported installer with a guessed `/mod install` or another repo's commands.

## 3. Connect privately

When Cowork already has an authorized login, the mod reuses its current managed session and re-reads it for requests. Do not copy its bearer/refresh token to prompts or commands. Match the configured Vera server; never substitute another account/server silently.

For standalone Letta Code, prefer the protected browser OAuth/PKCE path:

```text
/vera-connect
```

For this explicitly approved deployment:

```text
/vera-connect --server https://vera-cowork-server.ngrok.app browser
```

The human completes sign-in/consent in the intended Vera/browser interface; credentials/OTP remain private. An approved non-browser fallback may be used locally according to the active MOD.md, but **never ask the user to paste an OTP, password, token or authorization URL/code into agent chat**. Do not register an account, grant roles, change credentials or revoke an existing session as an implicit connection step.

## 4. Verify, then resume the original task

Run `/vera-status`, then `/vera-sync` if a catalog refresh is needed. Discover the relevant current tools with `vera_mcp_list_tools`, the appropriate `area`, and `includeSchemas: true`; invoke the exact returned identity/read-only tool with `vera_mcp_call_tool` to verify the authorized principal/workspace and capability. Use a focused query if the installed version does not support `area`.

Report states separately: **package obtained → installed → mod loaded → authenticated → tools discovered → requested resource verified**. Connected/counts do not prove a remote machine is online, a mailbox is shared or Odoo is granted. Preserve task/email/attachment references; do not restart the user's workflow with a generic “which email?” question when it is already identified.

## Configured MCP/Odoo boundary

Native Vera `/mcp` and user-configured outbound connectors are separate surfaces. For ERP, discover only the current principal's enabled configured connector and exact schemas; no retired `/odoo/*` REST fallback or global ERP credential. Mod installation/authentication does not automatically register an Odoo connector or grant its model/field permissions. Never disable outbound-network/ownership checks to make a connection appear successful.

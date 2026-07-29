# KiCad MCP setup

## Contents

- Prerequisites
- Install and build
- Platform notes
- Client configuration
- Verification
- Upgrades

## Prerequisites

Use the upstream README as the authority for supported versions. At the time this skill was created, the server required:

- KiCad 9.0 or newer
- Node.js 18 or newer
- Python compatible with the installed KiCad build
- Git
- An MCP client/runtime capable of starting a local STDIO server

KiCad 10 support exists upstream, but backend and file-format behavior varies by release. Pin a tested MCP revision for production work.

## Install and build

Choose a stable parent directory and set it explicitly:

```bash
export KICAD_MCP_DIR="$HOME/tools/KiCAD-MCP-Server"
git clone https://github.com/mixelpixx/KiCAD-MCP-Server.git "$KICAD_MCP_DIR"
cd "$KICAD_MCP_DIR"
npm ci
python3 -m pip install -r requirements.txt
npm run build
npm audit --omit=dev
```

For reproducible team setup, pin a reviewed release tag instead of tracking `main`. Review audit findings and dependency changes before production use. Do not run `npm audit fix` automatically because it can change the reviewed dependency graph.

Do not run setup scripts from an unreviewed fork. Inspect upstream changes before upgrading.

## Platform notes

### macOS

Use KiCad's bundled Python. The upstream `setup-macos.sh` detects paths and can merge Claude Desktop configuration safely.

```bash
cd "$KICAD_MCP_DIR"
bash setup-macos.sh --verify
bash setup-macos.sh --dry-run
# Ask before writing configuration:
bash setup-macos.sh --apply
```

If creating a virtual environment, derive the bundled Python path from the installed KiCad app and use `--system-site-packages` so `pcbnew` remains available.

### Linux

Install KiCad and its libraries from the appropriate distribution/release repository. Verify `pcbnew` with the same Python interpreter the MCP will use. A virtual environment is recommended, but it must retain access to KiCad's Python modules.

Set `KICAD_PYTHON` and `PYTHONPATH` only if auto-detection fails. Derive them from the installed KiCad package; do not copy another machine's paths.

### Windows

Use the upstream automated setup when possible:

```powershell
Set-Location $env:KICAD_MCP_DIR
.\setup-windows.ps1
```

For OpenCode, use `setup-windows-opencode.ps1` and preview/verify before applying. In JSON, use forward slashes or correctly escaped backslashes.

## Client configuration

The server is a local STDIO process:

```json
{
  "mcpServers": {
    "kicad": {
      "command": "node",
      "args": ["${KICAD_MCP_DIR}/dist/index.js"],
      "env": {
        "NODE_ENV": "production",
        "KICAD_PYTHON": "${KICAD_PYTHON}",
        "PYTHONPATH": "${KICAD_PYTHONPATH}",
        "LOG_LEVEL": "info",
        "KICAD_AUTO_LAUNCH": "false",
        "KICAD_MCP_DEV": "0"
      }
    }
  }
}
```

Not every client expands environment variables inside JSON. Resolve variables when generating the actual local configuration, while keeping portable templates variable-based.

### Backend choice

- `auto`: prefer IPC and fall back when unavailable; best default.
- `ipc`: real-time UI integration; requires KiCad running with IPC API enabled.
- `swig`: file-based backend; use deliberately when IPC is unavailable or unsuitable.

Set `KICAD_BACKEND` only when a specific choice is required.

## Verification

From this skill directory:

```bash
bash scripts/verify-kicad-mcp.sh "$KICAD_MCP_DIR"
```

On Windows:

```powershell
.\scripts\verify-kicad-mcp.ps1 -ServerPath $env:KICAD_MCP_DIR
```

Then restart/refresh the MCP client and test in order:

1. Tool catalog contains KiCad tools.
2. `check_kicad_ui` returns a structured result.
3. Open a disposable or version-controlled test project.
4. Run `get_project_info` and a component list query.
5. Create a snapshot.
6. Make one harmless change, validate it, then revert or discard the test project.

## Security gate

Keep the MCP bound to the local workstation and do not expose it as an unauthenticated network service.

A production-dependency audit of upstream commit `ccabbf0daff0db6e902e39d39ea734b018cd3eae` on 2026-07-29 reported five advisories (two high) in transitive dependencies, including Hono and `fast-uri`. Audit results change over time, so rerun the command locally. Before production approval, assess whether each finding is reachable in the chosen STDIO/transport configuration and update to an upstream-reviewed dependency set. Do not suppress the audit or apply unreviewed automatic upgrades.

## Upgrades

1. Save/commit all active KiCad projects.
2. Review upstream release notes and breaking changes.
3. Fetch and checkout the chosen reviewed release.
4. Run `npm install`, Python dependency install, and `npm run build`.
5. Re-run verification.
6. Refresh the MCP tool catalog because names/schemas may change.
7. Revalidate whitelist permissions; do not automatically authorize new tools.

#!/usr/bin/env bash
# Read-only prerequisite/build verification for macOS and Linux.
set -u

SERVER_DIR="${1:-${KICAD_MCP_DIR:-}}"
FAILURES=0
WARNINGS=0

ok() { printf 'OK    %s\n' "$1"; }
warn() { printf 'WARN  %s\n' "$1" >&2; WARNINGS=$((WARNINGS + 1)); }
fail() { printf 'FAIL  %s\n' "$1" >&2; FAILURES=$((FAILURES + 1)); }

if [[ -z "$SERVER_DIR" ]]; then
  printf 'Usage: %s /path/to/KiCAD-MCP-Server\n' "$0" >&2
  printf '   or: KICAD_MCP_DIR=/path/to/server %s\n' "$0" >&2
  exit 2
fi

if [[ ! -d "$SERVER_DIR" ]]; then
  printf 'FAIL  Server directory does not exist: %s\n' "$SERVER_DIR" >&2
  exit 1
fi

SERVER_DIR="$(cd "$SERVER_DIR" 2>/dev/null && pwd -P)" || exit 1
printf 'KiCad MCP verification (read-only)\nServer: %s\n\n' "$SERVER_DIR"

if command -v node >/dev/null 2>&1; then
  NODE_VERSION="$(node -p 'process.versions.node' 2>/dev/null || true)"
  NODE_MAJOR="${NODE_VERSION%%.*}"
  if [[ "$NODE_MAJOR" =~ ^[0-9]+$ ]] && (( NODE_MAJOR >= 18 )); then
    ok "Node.js $NODE_VERSION (>=18)"
  else
    fail "Node.js 18+ required; found ${NODE_VERSION:-unknown}"
  fi
else
  fail "node not found in PATH"
fi

if command -v npm >/dev/null 2>&1; then
  ok "npm $(npm --version 2>/dev/null)"
else
  fail "npm not found in PATH"
fi

if command -v git >/dev/null 2>&1; then
  ok "git available"
else
  fail "git not found in PATH"
fi

for required in package.json requirements.txt src python; do
  if [[ -e "$SERVER_DIR/$required" ]]; then
    ok "Found $required"
  else
    fail "Missing expected repository item: $required"
  fi
done

if [[ -d "$SERVER_DIR/node_modules" ]]; then
  ok "Node dependencies installed"
else
  fail "node_modules missing; run npm install in the server directory"
fi

if [[ -f "$SERVER_DIR/dist/index.js" ]]; then
  ok "Build artifact found: dist/index.js"
  if command -v node >/dev/null 2>&1 && node --check "$SERVER_DIR/dist/index.js" >/dev/null 2>&1; then
    ok "Build artifact passes Node syntax check"
  else
    fail "dist/index.js failed Node syntax check"
  fi
else
  fail "dist/index.js missing; run npm run build"
fi

PYTHON_BIN="${KICAD_PYTHON:-}"
if [[ -z "$PYTHON_BIN" && "$(uname -s 2>/dev/null)" == "Darwin" ]]; then
  PYTHON_BIN="/Applications/KiCad/KiCad.app/Contents/Frameworks/Python.framework/Versions/Current/bin/python3"
fi
if [[ -z "$PYTHON_BIN" ]]; then
  PYTHON_BIN="$(command -v python3 2>/dev/null || true)"
fi

if [[ -n "$PYTHON_BIN" && -x "$PYTHON_BIN" ]]; then
  PY_VERSION="$($PYTHON_BIN -c 'import platform; print(platform.python_version())' 2>/dev/null || true)"
  ok "Python available: ${PY_VERSION:-unknown} ($PYTHON_BIN)"
  PCBNEW_RESULT="$($PYTHON_BIN -c 'import pcbnew; print(pcbnew.GetBuildVersion() if hasattr(pcbnew, "GetBuildVersion") else "imported")' 2>&1)"
  if [[ $? -eq 0 ]]; then
    ok "pcbnew import succeeded: $PCBNEW_RESULT"
  else
    fail "pcbnew import failed with $PYTHON_BIN: $PCBNEW_RESULT"
  fi
else
  fail "KiCad Python not found; set KICAD_PYTHON to its executable"
fi

if command -v kicad-cli >/dev/null 2>&1; then
  KICAD_VERSION="$(kicad-cli version 2>/dev/null || true)"
  KICAD_MAJOR="${KICAD_VERSION%%.*}"
  if [[ "$KICAD_MAJOR" =~ ^[0-9]+$ ]] && (( KICAD_MAJOR >= 9 )); then
    ok "KiCad CLI $KICAD_VERSION"
  else
    warn "KiCad CLI version could not be confirmed as 9+: ${KICAD_VERSION:-unknown}"
  fi
else
  warn "kicad-cli not found in PATH; bundled Python check is authoritative on some installs"
fi

printf '\nResult: %d failure(s), %d warning(s)\n' "$FAILURES" "$WARNINGS"
if (( FAILURES > 0 )); then
  exit 1
fi
exit 0

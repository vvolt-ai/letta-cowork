import assert from "node:assert/strict";
import test from "node:test";

import { buildBashToolDescription } from "../dist-electron/services/client-tools/runners/bash.js";
import { buildWindowsShellLaunchers } from "../dist-electron/services/client-tools/runners/shell/shellLaunchers.js";

test("Windows shell contract prefers an installed Git Bash", () => {
  const launchers = buildWindowsShellLaunchers("printf 'ok'", [], {
    env: { ProgramFiles: "/programs" },
    pathExists: (path) => path === "/programs/Git/bin/bash.exe",
  });

  assert.deepEqual(launchers[0], [
    "/programs/Git/bin/bash.exe",
    "-lc",
    "printf 'ok'",
  ]);
});

test("PowerShell fallback preserves the host execution policy", () => {
  const launchers = buildWindowsShellLaunchers("npm.cmd test", [], {
    env: {},
    pathExists: () => false,
  });
  const powershell = launchers.find((launcher) => launcher[0] === "powershell.exe");

  assert.ok(powershell);
  assert.deepEqual(powershell.slice(0, 3), [
    "powershell.exe",
    "-NoProfile",
    "-Command",
  ]);
  assert.equal(powershell.includes("Bypass"), false);
});

test("Bash tool tells Windows agents how commands actually run", () => {
  const description = buildBashToolDescription("win32");
  assert.match(description, /prefers Git Bash/i);
  assert.match(description, /do not use Unix heredocs/i);
  assert.match(description, /npm\.cmd/i);
});

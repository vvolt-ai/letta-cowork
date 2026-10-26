import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'jsonc-parser';
import { getAbi } from 'node-abi';
import { shouldLaunchHidden, supportsLoginItems } from '../dist-electron/main/startup-policy.js';
test('manual launches stay visible; macOS login launches and explicit hidden flags stay hidden', () => {
  assert.equal(shouldLaunchHidden([], 'darwin', { wasOpenedAtLogin: false }), false);
  assert.equal(shouldLaunchHidden([], 'darwin', { wasOpenedAtLogin: true }), true);
  assert.equal(shouldLaunchHidden(['--hidden'], 'win32'), true);
  assert.equal(shouldLaunchHidden([], 'win32', { wasOpenedAtLogin: true }), false);
  assert.equal(shouldLaunchHidden(['--hidden'], 'linux'), true);
  assert.equal(supportsLoginItems('linux'), false);
  assert.equal(supportsLoginItems('darwin'), true);
  assert.equal(supportsLoginItems('win32'), true);
});
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const lock = parse(readFileSync(new URL('../bun.lock', import.meta.url), 'utf8'));
test('Electron 45 is exactly pinned in package and Bun lock metadata', () => {
  assert.equal(pkg.devDependencies.electron, '45.0.0');
  assert.equal(lock.workspaces[''].devDependencies.electron, '45.0.0');
  assert.equal(lock.packages.electron[0], 'electron@45.0.0');
});
test('native ABI mapping recognizes Electron 45 and rebuild stays on the local Bun toolchain', () => {
  assert.equal(pkg.overrides['node-abi'], '4.40.0');
  assert.equal(String(getAbi('45.0.0', 'electron')), '150');
  assert.equal(pkg.scripts.rebuild, 'bunx --no-install electron-rebuild -f');
});
test('Electron upgrade does not silently upgrade the deferred SDK/CLI pair', () => {
  assert.equal(pkg.dependencies['@letta-ai/letta-agent-sdk'], '0.8.50');
  assert.equal(pkg.dependencies['@letta-ai/letta-code'], '0.34.20');
});
test('sandboxed preload does not depend on Node shims/globals removed by Electron 45', () => {
  const preload = readFileSync(new URL('../src/electron/preload.cts', import.meta.url), 'utf8');
  assert.doesNotMatch(
    preload,
    /require\(\s*['"](?:events|timers|url)['"]|\b(?:Buffer|setImmediate|clearImmediate)\b/,
  );
});

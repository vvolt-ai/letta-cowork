import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// White-box registration method harness: no Electron startup, network or settings writes.
const source = readFileSync(new URL('../src/electron/services/remote-access/remoteRunnerClient.ts', import.meta.url), 'utf8');
const body = source.match(/private register\(\): void \{([\s\S]*?)\n  \}/)?.[1];
assert.ok(body, 'registration method must be testable');
const register = new Function('getClientToolsForWire', 'getMachineId', 'os', 'process', body);
test('runner advertises schema and capabilities from one immutable catalog snapshot', () => {
  const tools = [{ name: 'DesktopOnly', description: 'fixture', parameters: { type: 'object' } }];
  let reads = 0, payload;
  register.call({ settings: { allowedDirectories: ['/fixture'], environmentName: 'fixture', autoApprove: true }, send: value => { payload = value; } }, () => { reads++; return tools; }, () => 'fixture-device', { hostname: () => 'fixture-host' }, { cwd: () => '/fallback', platform: 'fixture', arch: 'fixture', env: {} });
  assert.equal(reads, 1);
  assert.equal(payload.type, 'runner.register');
  assert.deepEqual(payload.capabilities, ['DesktopOnly']);
  assert.deepEqual(JSON.parse(JSON.stringify(payload)).toolDefinitions, tools);
});

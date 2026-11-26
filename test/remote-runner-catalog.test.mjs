import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {CALLER_SESSION_ONLY_TOOLS} from '../dist-electron/services/remote-access/caller-session-tools.js';
import { remoteFileExportDefinition } from '../dist-electron/services/remote-access/remoteFileExport.js';

// White-box registration method harness: no Electron startup, network or settings writes.
const source = readFileSync(
  new URL('../src/electron/services/remote-access/remoteRunnerClient.ts', import.meta.url),
  'utf8',
);
const body = source.match(/private register\(\): void \{([\s\S]*?)\n  \}/)?.[1];
assert.ok(body, 'registration method must be testable');
const register = new Function(
  'getClientToolsForWire',
  'getMachineId',
  'os',
  'process',
  'remoteFileExportDefinition',
  'CALLER_SESSION_ONLY_TOOLS',
  body,
);
test('unsupported Windows export and caller-owned audit are not advertised as remote capabilities', () => {
  const tools = [{ name: 'DesktopOnly', description: 'fixture', parameters: { type: 'object' } },...['SafetyAuditListOwn','VeraMcpListTools','VeraMcpCallTool'].map(name=>({name,description:'caller only',parameters:{type:'object'}}))];
  let payload;
  register.call(
    {
      settings: {
        allowedDirectories: ['C:\\fixture'],
        environmentName: 'fixture',
        autoApprove: true,
      },
      send: (value) => {
        payload = value;
      },
    },
    () => tools,
    () => 'fixture-device',
    { hostname: () => 'fixture-host' },
    { cwd: () => 'C:\\fixture', platform: 'win32', arch: 'x64', env: {} },
    remoteFileExportDefinition,
    CALLER_SESSION_ONLY_TOOLS,
  );
  assert.deepEqual(payload.capabilities, ['DesktopOnly']);
  assert.deepEqual(payload.toolDefinitions, tools.filter(tool=>!CALLER_SESSION_ONLY_TOOLS.has(tool.name)));
});

test('runner advertises schema and capabilities from one immutable catalog snapshot', () => {
  const tools = [{ name: 'DesktopOnly', description: 'fixture', parameters: { type: 'object' } }];
  let reads = 0,
    payload;
  register.call(
    {
      settings: { allowedDirectories: ['/fixture'], environmentName: 'fixture', autoApprove: true },
      send: (value) => {
        payload = value;
      },
    },
    () => {
      reads++;
      return tools;
    },
    () => 'fixture-device',
    { hostname: () => 'fixture-host' },
    { cwd: () => '/fallback', platform: 'fixture', arch: 'fixture', env: {} },
    remoteFileExportDefinition,
    CALLER_SESSION_ONLY_TOOLS,
  );
  assert.equal(reads, 1);
  assert.equal(payload.type, 'runner.register');
  assert.deepEqual(payload.capabilities, ['DesktopOnly', remoteFileExportDefinition.name]);
  assert.deepEqual(JSON.parse(JSON.stringify(payload)).toolDefinitions, [
    ...tools,
    remoteFileExportDefinition,
  ]);
});

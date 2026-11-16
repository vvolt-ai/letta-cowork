import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createFileManagerTools,
  FILE_MANAGER_ORIGIN,
} from '../dist-electron/services/client-tools/runners/fileManager.js';
import { getClientToolsForWire } from '../dist-electron/services/client-tools/index.js';
import { createCanUseToolHandler } from '../dist-electron/libs/runner/permission-handler.js';
import { PlanModeManager } from '../dist-electron/libs/runner/plan-mode/mode-manager.js';

test('only File Manager health is allowed during planning, never publication',()=>{
  const manager=new PlanModeManager();manager.setMode('plan');
  assert.equal(manager.checkPermission('FileManagerHealth',{}).decision,'allow');
  assert.equal(manager.checkPermission('FileManagerUpload',{confirm_public_upload:true}).decision,'deny');
});

test('File Manager tools are advertised with bounded explicit publication selectors', () => {
  for (const name of ['FileManagerHealth', 'FileManagerUpload'])
    assert.ok(getClientToolsForWire().some((t) => t.name === name));
  const tool = getClientToolsForWire().find((t) => t.name === 'FileManagerUpload');
  assert.equal(tool.parameters.additionalProperties, false);
  assert.deepEqual(tool.parameters.required, ['file_path', 'confirm_public_upload']);
});
for (const mode of ['unrestricted', 'standard', 'acceptEdits', 'strict'])
  test(
    'File Manager publication needs a fresh exact human response despite prior grants: ' + mode,
    async () => {
      const session = {
          pendingPermissions: new Map(),
          permissionGrants: { allowAll: true, allowedTools: new Set(['FileManagerUpload']) },
        },
        requests = [];
      const handler = createCanUseToolHandler(
          session,
          (id, name, input) => requests.push({ id, name, input }),
          mode,
        ),
        input = { file_path: 'report.pdf', confirm_public_upload: true };
      const decision = handler('FileManagerUpload', input);
      assert.equal(requests.length, 1);
      assert.equal(requests[0].input, input);
      session.pendingPermissions
        .get(requests[0].id)
        .resolve({ behavior: 'deny', message: 'Not approved' });
      assert.equal((await decision).behavior, 'deny');
    },
  );
test('health is read-only under ordinary desktop permissions', async () => {
  const session = {
      pendingPermissions: new Map(),
      permissionGrants: { allowAll: false, allowedTools: new Set() },
    },
    handler = createCanUseToolHandler(
      session,
      () => assert.fail('health should not request publication approval'),
      'standard',
    );
  assert.equal((await handler('FileManagerHealth', {})).behavior, 'allow');
});
test('desktop uploads a workspace snapshot once and returns only a verified same-service link', async () => {
  const root = await mkdtemp(join(tmpdir(), 'desktop-file-manager-')),
    bytes = Buffer.from('Synthetic desktop report'),
    calls = [];
  try {
    await writeFile(join(root, 'report.pdf'), bytes);
    const mock = async (url, options) => {
      calls.push({ url, options });
      return options.method === 'POST'
        ? Response.json({ url: FILE_MANAGER_ORIGIN + '/files/fixture-desktop' })
        : new Response(bytes);
    };
    const tool = createFileManagerTools(mock).find((t) => t.name === 'FileManagerUpload'),
      ctx = { signal: new AbortController().signal, workingDirectory: root };
    const denied = await tool.run({ file_path: 'report.pdf' }, ctx);
    assert.equal(denied.isError, true);
    assert.equal(calls.length, 0);
    const returned = await tool.run({ file_path: 'report.pdf', confirm_public_upload: true }, ctx),
      data = JSON.parse(returned.output);
    assert.equal(returned.isError, false);
    assert.equal(data.download_verified, true);
    assert.equal(data.download_url, FILE_MANAGER_ORIGIN + '/files/fixture-desktop');
    assert.equal(calls.length, 2);
    assert.equal(calls[0].options.redirect, 'error');
    assert.equal(calls[0].options.credentials, 'omit');
    assert.equal(data.file_path, undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

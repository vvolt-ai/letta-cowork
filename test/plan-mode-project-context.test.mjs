import test from 'node:test';
import assert from 'node:assert/strict';
import { PlanModeManager } from '../dist-electron/libs/runner/plan-mode/mode-manager.js';
import { createCanUseToolHandler } from '../dist-electron/libs/runner/permission-handler.js';

test('ProjectContext remains available in plan mode without granting mutations', () => {
  const mode = new PlanModeManager();
  mode.setMode('plan');
  assert.equal(mode.checkPermission('ProjectContext', { includeScripts: true }).decision, 'allow');
  assert.equal(mode.checkPermission('Write', { file_path: '/tmp/not-a-plan.ts', content: 'x' }).decision, 'deny');
  assert.equal(mode.checkPermission('ProjectRunScript', { script: 'build' }).decision, 'deny');
  assert.equal(mode.checkPermission('UnknownTool', {}).decision, 'deny');
  assert.equal(mode.getMode(), 'plan');
});

test('ProjectContext also passes standard read-only approval policy without prompting', async () => {
  const session = { pendingPermissions: new Map(), permissionGrants: { allowAll: false, allowedTools: new Set() } };
  const handler = createCanUseToolHandler(session, () => assert.fail('Read-only context must not prompt'), 'standard');
  assert.equal((await handler('ProjectContext', { includeScripts: true }, new AbortController().signal)).behavior, 'allow');
});

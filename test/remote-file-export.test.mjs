import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  exportRemoteFile,
  MAX_REMOTE_FILE_BYTES,
  REMOTE_FILE_EXPORT_TOOL,
} from '../dist-electron/services/remote-access/remoteFileExport.js';
import { RemoteToolDispatcher } from '../dist-electron/services/remote-access/remoteToolDispatcher.js';
const signal = () => new AbortController().signal;
async function fixture(fn) {
  const root = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'remote-file-fixture-')));
  try {
    await fn(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}
test(
  'remote export preserves exact binary bytes, filename, size and integrity',
  { skip: process.platform === 'win32' },
  () =>
    fixture(async (root) => {
      const bytes = Buffer.from([0, 255, 13, 10, 65, 128]);
      await fs.writeFile(join(root, 'logs.bin'), bytes);
      const file = await exportRemoteFile('logs.bin', [root], root, signal());
      assert.deepEqual(Buffer.from(file.base64, 'base64'), bytes);
      assert.equal(file.size, bytes.length);
      assert.equal(file.fileName, 'logs.bin');
      assert.equal(file.sha256, createHash('sha256').update(bytes).digest('hex'));
    }),
);
test(
  'traversal, credential names and symlink escape are denied',
  { skip: process.platform === 'win32' },
  () =>
    fixture(async (root) => {
      const inside = join(root, 'workspace'),
        outside = join(root, 'outside');
      await fs.mkdir(inside);
      await fs.mkdir(outside);
      await fs.writeFile(join(outside, 'file.txt'), 'outside');
      await fs.writeFile(join(inside, '.env'), 'fixture-secret');
      await assert.rejects(
        exportRemoteFile('../outside/file.txt', [inside], inside, signal()),
        /DENIED/,
      );
      await assert.rejects(exportRemoteFile('.env', [inside], inside, signal()), /DENIED/);
      await fs.symlink(outside, join(inside, 'escape'), 'dir');
      await assert.rejects(
        exportRemoteFile('escape/file.txt', [inside], inside, signal()),
        /DENIED/,
      );
      await fs.symlink(join(outside, 'file.txt'), join(inside, 'linked.txt'));
      await assert.rejects(
        exportRemoteFile('linked.txt', [inside], inside, signal()),
        /REGULAR_FILE/,
      );
      await assert.rejects(exportRemoteFile(outside, [], inside, signal()), /WORKSPACE_REQUIRED/);
    }),
);
test('oversize and cancelled requests produce no exported bytes', () =>
  fixture(async (root) => {
    const file = join(root, 'large.bin');
    await fs.writeFile(file, '');
    await fs.truncate(file, MAX_REMOTE_FILE_BYTES + 1);
    await assert.rejects(exportRemoteFile(file, [root], root, signal()), /TOO_LARGE/);
    const ctrl = new AbortController();
    ctrl.abort();
    await assert.rejects(exportRemoteFile(file, [root], root, ctrl.signal), { name: 'AbortError' });
  }));
test(
  'private dispatcher transport does not leak file bytes into model-visible output',
  { skip: process.platform === 'win32' },
  () =>
    fixture(async (root) => {
      const contents = 'fixture-private-file';
      await fs.writeFile(join(root, 'logs.txt'), contents);
      const dispatcher = new RemoteToolDispatcher({
        enabled: true,
        autoApprove: true,
        allowedDirectories: [root],
      });
      const result = await dispatcher.runTool({
        requestId: 'fixture-export',
        toolName: REMOTE_FILE_EXPORT_TOOL,
        args: { filePath: 'logs.txt' },
        cwd: root,
      });
      assert.equal(result.status, 'success');
      assert.ok(!result.output.includes(contents));
      assert.ok(!result.output.includes(Buffer.from(contents).toString('base64')));
      assert.equal(Buffer.from(result.metadata.fileTransfer.base64, 'base64').toString(), contents);
      for (const options of [
        { enabled: false, autoApprove: true },
        { enabled: true, autoApprove: false },
      ]) {
        const denied = await new RemoteToolDispatcher({
          ...options,
          allowedDirectories: [root],
        }).runTool({
          requestId: 'denied',
          toolName: REMOTE_FILE_EXPORT_TOOL,
          args: { filePath: 'logs.txt' },
        });
        assert.equal(denied.status, 'error');
        assert.equal(denied.metadata, undefined);
      }
    }),
);

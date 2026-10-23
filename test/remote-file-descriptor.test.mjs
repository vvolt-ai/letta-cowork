import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { promises as fs, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { REMOTE_FILE_EXPORT_PYTHON } from '../dist-electron/services/remote-access/remoteFileExportPython.js';
const python = (
  process.platform === 'darwin'
    ? [
        '/opt/homebrew/bin/python3',
        '/usr/local/bin/python3',
        '/Library/Developer/CommandLineTools/usr/bin/python3',
      ]
    : ['/usr/bin/python3', '/usr/local/bin/python3']
).find(existsSync);
function helper(root, relative) {
  return new Promise((resolve, reject) => {
    const child = spawn(python, ['-I', '-c', REMOTE_FILE_EXPORT_PYTHON], {
      env: { PATH: '/usr/bin:/bin' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let out = '',
      err = '';
    child.stdout.on('data', (data) => (out += data));
    child.stderr.on('data', (data) => (err += data));
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, out, err }));
    child.stdin.end(JSON.stringify({ root, relative }));
  });
}
test(
  'descriptor helper rejects symlink ancestors instead of following a swapped directory',
  { skip: process.platform === 'win32' || !python },
  async () => {
    const root = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'remote-openat-fixture-')));
    try {
      const workspace = join(root, 'workspace'),
        outside = join(root, 'outside');
      await fs.mkdir(workspace);
      await fs.mkdir(outside);
      await fs.writeFile(join(outside, 'logs.txt'), 'outside-fixture');
      await fs.symlink(outside, join(workspace, 'swapped'), 'dir');
      const result = await helper(workspace, 'swapped/logs.txt');
      assert.notEqual(result.code, 0);
      assert.equal(result.out, '');
      assert.match(result.err, /SECURE_READ_DENIED/);
      const traversal = await helper(workspace, '../outside/logs.txt');
      assert.notEqual(traversal.code, 0);
      assert.equal(traversal.out, '');
      await fs.mkdir(join(workspace, 'pinned'));
      await fs.writeFile(join(workspace, 'pinned', 'logs.txt'), 'inside-fixture');
      const valid = await helper(workspace, 'pinned/logs.txt');
      assert.equal(valid.code, 0);
      assert.equal(
        Buffer.from(JSON.parse(valid.out).base64, 'base64').toString(),
        'inside-fixture',
      );
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  },
);

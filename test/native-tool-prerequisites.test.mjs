import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  resolveRipgrep,
  unpackedExecutablePath,
} from '../dist-electron/services/client-tools/runners/_shared/ripgrepManager.js';
import { extractLocalPdf } from '../dist-electron/services/client-tools/runners/_shared/localPdf.js';
import { getShellEnv } from '../dist-electron/services/client-tools/runners/shell/shellEnv.js';

test('packaged executable resolution uses unpacked paths for both Windows slash forms', () => {
  assert.equal(
    unpackedExecutablePath('C:\\App\\resources\\app.asar\\node_modules\\rg.exe'),
    'C:\\App\\resources\\app.asar.unpacked\\node_modules\\rg.exe',
  );
  assert.equal(
    unpackedExecutablePath('/App/resources/app.asar/node_modules/rg'),
    '/App/resources/app.asar.unpacked/node_modules/rg',
  );
  assert.equal(
    unpackedExecutablePath('/App/resources/app.asar.unpacked/node_modules/rg'),
    '/App/resources/app.asar.unpacked/node_modules/rg',
  );
});

test('managed verified ripgrep is preferred without depending on global PATH', () => {
  const expected = join('/managed', process.platform === 'win32' ? 'rg.exe' : 'rg');
  const result = resolveRipgrep({
    env: { LETTA_CODE_TOOLS_DIR: '/managed', PATH: '' },
    exists: (path) => path === expected,
    works: (path) => path === expected,
    bundledPath: null,
  });
  assert.equal(result, expected);
});

test('bundled ripgrep resolves after missing managed/PATH executables', () => {
  const bundled = '/App/resources/app.asar/node_modules/@vscode/ripgrep/bin/rg';
  const unpacked = unpackedExecutablePath(bundled);
  const result = resolveRipgrep({
    exists: (path) => path === unpacked,
    works: (path) => path === unpacked,
    bundledPath: bundled,
  });
  assert.equal(result, unpacked);
});

test('broken or absent executable reports unavailable rather than returning an unusable path', () => {
  assert.equal(
    resolveRipgrep({ exists: () => true, works: () => false, bundledPath: '/bad/rg' }),
    null,
  );
});

test('ripgrep is an owned dependency and its binary is included/unpacked by packaging', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const builder = JSON.parse(
    await readFile(new URL('../electron-builder.json', import.meta.url), 'utf8'),
  );
  assert.equal(pkg.dependencies['@vscode/ripgrep'], '1.18.0');
  assert.ok(builder.files.includes('node_modules/@vscode/ripgrep*/**/*'));
  assert.ok(builder.asarUnpack.includes('node_modules/@vscode/ripgrep*/**/*'));
});

test('shell subprocesses use the verified managed binary without mutating global environment', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cowork-rg-prerequisite-'));
  const pathBefore = process.env.PATH;
  try {
    const require = createRequire(import.meta.url);
    const { rgPath } = require('@vscode/ripgrep');
    const binary = process.platform === 'win32' ? 'rg.exe' : 'rg';
    await copyFile(rgPath, join(root, binary));
    const env = getShellEnv({ LETTA_CODE_TOOLS_DIR: root });
    const pathKey = Object.keys(env).find((key) => key.toUpperCase() === 'PATH');
    assert.ok(env[pathKey].startsWith(root));
    assert.equal(process.env.PATH, pathBefore);
    assert.notEqual(process.env.LETTA_CODE_TOOLS_DIR, root);
  } finally {
    assert.ok(root.startsWith(join(tmpdir(), 'cowork-rg-prerequisite-')));
    await rm(root, { recursive: true, force: true });
  }
});

test('local PDF extraction uses an argument array, no shell, bounded output/time and page markers', async () => {
  const file = 'C:/Customer Files/PO ; do-not-execute.pdf';
  const output = await extractLocalPdf(file, {
    executable: '/verified/pdftotext',
    run: async (command, args, options) => {
      assert.equal(command, '/verified/pdftotext');
      assert.deepEqual(args, ['-layout', '-enc', 'UTF-8', file, '-']);
      assert.equal(options.shell, undefined);
      assert.equal(options.windowsHide, true);
      assert.equal(options.timeout, 30_000);
      assert.equal(options.maxBuffer, 10 * 1024 * 1024);
      return { stdout: 'PO 12345\nTotal 100.00\fNet30\f' };
    },
  });
  assert.match(output, /Page 1/);
  assert.match(output, /Page 2/);
  assert.match(output, /PO 12345/);
  assert.match(output, /signatures are not visually verified/);
});

test('missing PDF extractor is a concrete prerequisite, not a successful empty read', async () => {
  await assert.rejects(
    extractLocalPdf('/PO.pdf', {
      run: async () => {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      },
    }),
    /PDF_EXTRACTOR_UNAVAILABLE/,
  );
});

test('scanned/blank PDF requires OCR and malformed/timeout output cannot claim verified content', async () => {
  await assert.rejects(
    extractLocalPdf('/scanned.pdf', { run: async () => ({ stdout: '\f' }) }),
    /PDF_OCR_REQUIRED/,
  );
  await assert.rejects(
    extractLocalPdf('/bad.pdf', {
      run: async () => {
        throw new Error('failed');
      },
    }),
    /PDF_EXTRACTION_FAILED/,
  );
  const output = await extractLocalPdf('/mixed.pdf', {
    run: async () => ({ stdout: 'page one\f\fpage three\f' }),
  });
  assert.match(output, /Pages 2 returned no text/);
});

test('Read uses the local PDF capability before binary rejection and delegates inherit Read', async () => {
  const reader = await readFile(
    new URL('../src/electron/services/client-tools/runners/letta_tools/Read.ts', import.meta.url),
    'utf8',
  );
  assert.ok(
    reader.indexOf('await extractLocalPdf(resolvedPath)') <
      reader.indexOf('await isBinaryFile(resolvedPath)'),
  );
  const manager = await readFile(
    new URL('../src/electron/services/agent/subagents/manager.ts', import.meta.url),
    'utf8',
  );
  assert.match(manager, /getClientToolsForWire\(\)\.filter/);
  assert.match(manager, /SUBAGENT_BLOCKED_TOOLS = new Set\(\["Task"\]\)/);
});

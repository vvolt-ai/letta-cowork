import test from 'node:test';
import assert from 'node:assert/strict';
import {
  existsSync,
  readFileSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  symlinkSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
const retired = [
  'ipc/handlers/session-handlers',
  'emails/emailServerClient',
  'emails/lettaProxy',
  'emails/pdfConverter',
  'emails/express/odoo-handlers',
  'services/client-tools/runners/fs',
  'services/skill-sync/index',
];
test('retired unreachable Electron modules do not survive in source or generated artifacts', () => {
  for (const file of retired) {
    assert.equal(
      existsSync(new URL('../src/electron/' + file + '.ts', import.meta.url)),
      false,
      file,
    );
    for (const ext of ['.js', '.js.map'])
      assert.equal(
        existsSync(new URL('../dist-electron/' + file + ext, import.meta.url)),
        false,
        file + ext,
      );
  }
});
test('canonical feature entrypoints and externally usable compatibility types remain', () => {
  for (const file of [
    'src/electron/ipc/handlers/session/index.ts',
    'src/electron/ipc/handlers/session/history-handler.ts',
    'src/electron/services/client-tools/runners/letta_tools/index.ts',
    'src/electron/services/extensions/extension-types.ts',
    'src/electron/ipc/types.ts',
    'src/electron/services/remote-access/remoteAccessSettings.ts',
    'src/ui/features/channels/components/CreateChannelModal.tsx',
    'src/ui/features/chat/components/ConversationViewer/index.tsx',
    'src/ui/features/email/components/EmailInboxModal/index.tsx',
  ])
    assert.ok(existsSync(new URL('../' + file, import.meta.url)), file);
  const ipc = readFileSync(new URL('../src/electron/ipc/index.ts', import.meta.url), 'utf8');
  assert.match(ipc, /handlers\/session\/index\.js/);
  assert.doesNotMatch(ipc, /session-handlers\.js/);
});
const script = readFileSync(
  new URL('../scripts/prune-retired-runtime.mjs', import.meta.url),
  'utf8',
);
function isolatedFixture(run) {
  const root = mkdtempSync(join(tmpdir(), 'cowork-prune-contract-'));
  try {
    mkdirSync(join(root, 'scripts'));
    writeFileSync(join(root, 'scripts/prune.mjs'), script);
    run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
test('artifact pruning refuses to erase output if the corresponding source is restored', () =>
  isolatedFixture((root) => {
    const source = join(root, 'src/electron/ipc/handlers/session-handlers.ts'),
      output = join(root, 'dist-electron/ipc/handlers/session-handlers.js');
    mkdirSync(dirname(source), { recursive: true });
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(source, 'export {};');
    writeFileSync(output, 'KEEP');
    const result = spawnSync(process.execPath, [join(root, 'scripts/prune.mjs')], {
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /source exists/);
    assert.equal(readFileSync(output, 'utf8'), 'KEEP');
  }));
test(
  'artifact pruning never follows a linked build directory',
  { skip: process.platform === 'win32' },
  () =>
    isolatedFixture((root) => {
      const target = join(root, 'outside');
      mkdirSync(target);
      writeFileSync(join(target, 'KEEP'), 'fixture');
      symlinkSync(target, join(root, 'dist-electron'), 'dir');
      const result = spawnSync(process.execPath, [join(root, 'scripts/prune.mjs')], {
        encoding: 'utf8',
      });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /Unsafe retired runtime output path/);
      assert.equal(readFileSync(join(target, 'KEEP'), 'utf8'), 'fixture');
    }),
);

// tsc does not remove old outputs. Prune only named retired engine artifacts;
// never a user profile, source tree, or a path through a linked build directory.
import { lstat, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const retiredModules = [
  'ipc/handlers/session-handlers',
  'emails/emailServerClient',
  'emails/lettaProxy',
  'emails/pdfConverter',
  'emails/express/odoo-handlers',
  'services/client-tools/runners/fs',
  'services/skill-sync/index',
];
const artifacts = [
  ...retiredModules.flatMap((name) => [
    [name + '.js', name + '.ts'],
    [name + '.js.map', name + '.ts'],
  ]),
  ['libs/runner/ws', 'libs/runner/ws/session.ts'],
  ['services/agents/approval-recovery.js', 'services/agents/approval-recovery.ts'],
  ['services/agents/approval-recovery.js.map', 'services/agents/approval-recovery.ts'],
];
for (const [output, source] of artifacts) {
  try {
    await lstat(new URL('../src/electron/' + source, import.meta.url));
    throw Error('Refusing to prune runtime output while its source exists.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const parts = ('dist-electron/' + output).split('/');
  for (let n = 1; n <= parts.length; n++) {
    try {
      const stat = await lstat(new URL('../' + parts.slice(0, n).join('/'), import.meta.url));
      if (stat.isSymbolicLink() || (n < parts.length && !stat.isDirectory()))
        throw Error('Unsafe retired runtime output path.');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  await rm(fileURLToPath(new URL('../dist-electron/' + output, import.meta.url)), {
    recursive: true,
    force: true,
  });
}

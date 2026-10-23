import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Verify bundle integrity only. This is NOT Developer ID trust, notarization,
 * Gatekeeper acceptance, or permission to remove quarantine. Never re-sign an
 * already downloaded app here: a broken build must fail before distribution. */
export function verifyMacBundle(appPath, run = spawnSync) {
  if (typeof appPath !== 'string' || !appPath.endsWith('.app'))
    throw Error('Expected a macOS .app bundle path.');
  const verified = run(
    '/usr/bin/codesign',
    ['--verify', '--deep', '--strict', '--verbose=2', appPath],
    { encoding: 'utf8', maxBuffer: 1024 * 1024 },
  );
  if (verified.error || verified.status !== 0)
    throw Error(
      'macOS bundle integrity verification failed: ' +
        (verified.stderr || verified.error?.message || 'codesign failed'),
    );
  const details = run('/usr/bin/codesign', ['--display', '--verbose=2', appPath], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  const metadata = (details.stdout ?? '') + (details.stderr ?? '');
  if (
    details.error ||
    details.status !== 0 ||
    !/^Identifier=com\.vera\.cowork\r?$/m.test(metadata) ||
    !/Sealed Resources version=/.test(metadata) ||
    /Info\.plist=not bound|Sealed Resources=none/.test(metadata)
  )
    throw Error('macOS bundle has an unexpected identity or missing resource seal.');
  return metadata;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.platform !== 'darwin') throw Error('Bundle signature verification requires macOS.');
    verifyMacBundle(process.argv[2]);
    console.log(
      'Cowork bundle integrity verified. Developer ID trust/notarization is not asserted.',
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

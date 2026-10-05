import assert from 'node:assert/strict';
import test from 'node:test';
import { assertSafeWindowsCommand } from '../dist-electron/services/client-tools/runners/_shared/windows-command-safety.js';
import {
  captureRuntimeSecretValues,
  redactRuntimeSecrets,
  runWithRuntimeSecrets,
  getSensitiveEnvValues,
} from '../dist-electron/services/client-tools/runners/_shared/runtime-secrets.js';

const windows = {
  platform: 'win32',
  cwd: 'C:\\Users\\operator\\project',
  homeDirectory: 'C:\\Users\\operator',
  env: { USERPROFILE: 'C:\\Users\\operator', SYSTEMDRIVE: 'C:' },
};
for (const command of [
  'cmd /c rd /s /q C:\\',
  'cmd.exe /d /c rmdir /s /q C:\\Users',
  'cmd /c "del /q C:\\Windows\\*"',
  'cmd /c erase /q %USERPROFILE%',
  'cmd /c rd /s /q "C:\\$name"',
  'pwsh -Command "cmd /c rd /s /q C:\\Users"',
]) {
  test('blocks protected Windows removal: ' + command, () =>
    assert.throws(() => assertSafeWindowsCommand(command, windows), /protected Windows path/),
  );
}
for (const command of ['cmd /c rd /s /q dist', 'cmd /c del /q dist\\*', 'cmd /c echo C:\\Users']) {
  test('does not overblock project/inspection command: ' + command, () =>
    assert.doesNotThrow(() => assertSafeWindowsCommand(command, windows)),
  );
}
test('Windows guard is not applied on other platforms', () =>
  assert.doesNotThrow(() =>
    assertSafeWindowsCommand('cmd /c rd /s /q C:\\', { ...windows, platform: 'linux' }),
  ));

test('ambient credential values and launch-time snapshots remain redacted after rotation/removal', async () => {
  const key = 'MIGRATION_API_KEY';
  const previous = process.env[key];
  try {
    process.env[key] = 'old-ambient-secret-1843';
    const snapshot = captureRuntimeSecretValues();
    process.env[key] = 'new-ambient-secret-9241';
    const output = redactRuntimeSecrets(
      'old-ambient-secret-1843 new-ambient-secret-9241',
      {},
      snapshot,
    );
    assert.equal(output, '[REDACTED_SECRET] [REDACTED_SECRET]');
    await runWithRuntimeSecrets(snapshot, async () => {
      delete process.env[key];
      await Promise.resolve();
      assert.equal(redactRuntimeSecrets('old-ambient-secret-1843'), '[REDACTED_SECRET]');
    });
  } finally {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
});
test('normal environment settings are not automatically credential values', () => {
  assert.deepEqual(
    getSensitiveEnvValues({
      API_BASE_URL: 'https://example.com',
      ENABLED: 'true',
      CUSTOM_API_KEY: 'sensitive',
    }),
    ['sensitive'],
  );
});

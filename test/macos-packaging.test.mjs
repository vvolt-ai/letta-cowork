import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { verifyMacBundle } from '../scripts/verify-macos-bundle.mjs';
const { load } = createRequire(import.meta.url)('js-yaml');
const config = JSON.parse(
  readFileSync(new URL('../electron-builder.json', import.meta.url), 'utf8'),
);
const workflow = load(
  readFileSync(new URL('../.github/workflows/build.yml', import.meta.url), 'utf8'),
);

test('internal mac builds use an explicit ad-hoc identity without certificate discovery or PR signing overrides', () => {
  assert.equal(config.mac.identity, '-');
  assert.equal(config.mac.notarize, false);
  assert.notEqual(config.mac.hardenedRuntime, false);
  assert.equal(workflow.env.CSC_IDENTITY_AUTO_DISCOVERY, 'false');
  assert.equal(workflow.env.CSC_FOR_PULL_REQUEST, undefined);
  assert.equal(workflow.jobs['build-macos-arm64'].if, "github.event_name != 'pull_request'");
});
test('CI verifies sealed bundle and DMG before uploading the installer', () => {
  const steps = workflow.jobs['build-macos-arm64'].steps;
  const verify = steps.findIndex((step) =>
    step.run?.includes('node scripts/verify-macos-bundle.mjs'),
  );
  const upload = steps.findIndex((step) => step.uses?.startsWith('actions/upload-artifact@'));
  assert.ok(verify > 0 && verify < upload);
  assert.match(steps[verify].run, /hdiutil verify dist\/\*\.dmg/);
});
test('bundle verifier rejects the observed linker signature/resource-seal failure', () => {
  const calls = [];
  const run = (name, args) => {
    calls.push({ name, args });
    return {
      status: 1,
      stderr: 'code has no resources but signature indicates they must be present',
    };
  };
  assert.throws(
    () => verifyMacBundle('/fixture/Vera Cowork.app', run),
    /integrity verification failed/,
  );
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args.slice(0, 4), ['--verify', '--deep', '--strict', '--verbose=2']);
});
test('bundle verifier accepts valid integrity, but not unbound or wrong bundle metadata', () => {
  const valid =
    'Identifier=com.vera.cowork\nSignature=adhoc\nInfo.plist entries=32\nSealed Resources version=2 rules=13 files=20\n';
  const runFor = (metadata) => (name, args) => ({
    status: 0,
    stdout: '',
    stderr: args[0] === '--display' ? metadata : 'valid on disk',
  });
  assert.equal(verifyMacBundle('/fixture/Vera Cowork.app', runFor(valid)), valid);
  for (const invalid of [
    valid.replace('com.vera.cowork', 'Electron'),
    valid.replace('Sealed Resources version=2 rules=13 files=20', 'Sealed Resources=none'),
    valid.replace('Info.plist entries=32', 'Info.plist=not bound'),
  ])
    assert.throws(
      () => verifyMacBundle('/fixture/Vera Cowork.app', runFor(invalid)),
      /identity or missing resource seal/,
    );
});

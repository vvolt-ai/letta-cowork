import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const { load } = createRequire(import.meta.url)('js-yaml');
const workflowText = readFileSync(
  new URL('../.github/workflows/build.yml', import.meta.url),
  'utf8',
);
const workflow = load(workflowText);
test('CI has safe push/PR/manual build triggers and no release credentials', () => {
  assert.deepEqual(workflow.on.push.branches, ['main']);
  assert.deepEqual(workflow.on.pull_request.branches, ['main']);
  assert.ok(Object.hasOwn(workflow.on, 'workflow_dispatch'));
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.equal(workflow['concurrency']['cancel-in-progress'], true);
  assert.equal(workflow.env.CSC_IDENTITY_AUTO_DISCOVERY, 'false');
  assert.ok(!/pull_request_target|secrets\./.test(workflowText));
});
test('Windows/Linux remain build-only and Apple Silicon follows both successful platforms', () => {
  const expected = [
    ['build-windows', 'windows-latest', 'dist:win', 'dist/*.exe'],
    ['build-linux', 'ubuntu-latest', 'dist:linux', 'dist/*.deb'],
    ['build-macos-arm64', 'macos-15', 'dist:mac-arm64', 'dist/*.dmg'],
  ];
  for (const [name, runner, script, artifact] of expected) {
    const job = workflow.jobs[name];
    assert.equal(job['runs-on'], runner);
    assert.ok(job.steps.some((step) => step.run === 'bun install --frozen-lockfile'));
    assert.ok(job.steps.some((step) => step.run === 'bun run ' + script));
    const upload = job.steps.find((step) => step.uses?.startsWith('actions/upload-artifact@'));
    assert.ok(upload.with.path.includes(artifact));
    assert.equal(upload.with['if-no-files-found'], 'error');
    assert.equal(
      job.steps.find((step) => step.uses?.startsWith('actions/checkout@')).with[
        'persist-credentials'
      ],
      false,
    );
  }
  assert.deepEqual(workflow.jobs['build-macos-arm64'].needs, ['build-windows', 'build-linux']);
});

const root = fileURLToPath(new URL('..', import.meta.url));
test('all installer commands disable electron-builder implicit CI publishing without credentials', () => {
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `
    import assert from 'node:assert/strict';
    import {createRequire} from 'node:module';
    import {readFileSync} from 'node:fs';
    const require=createRequire(import.meta.url);
    const {createYargs,configureBuildCommand,normalizeOptions}=require('electron-builder/out/builder.js');
    const {PublishManager}=require('app-builder-lib/out/publish/PublishManager.js');
    const {CancellationToken}=require('builder-util-runtime');
    const scripts=JSON.parse(readFileSync('package.json','utf8')).scripts;
    for(const name of ['dist:win','dist:linux','dist:mac-arm64','dist:mac-x64']){
      const command=scripts[name].split('&&')[1].trim();
      assert.match(command,/--publish\\s+never$/,name);
      const args=command.split(/\\s+/).slice(1);
      const options=normalizeOptions(configureBuildCommand(createYargs()).parse(args));
      assert.equal(options.publish,'never',name);
      const packager={onAfterPack(){},onArtifactCreated(){}};
      const manager=new PublishManager(packager,options,new CancellationToken());
      assert.equal(manager.isPublish,false,name+' must not create a CI publisher');
    }
    console.log('BUILD_ONLY_CI_VERIFIED');
  `,
    ],
    {
      cwd: root,
      env: {
        PATH: process.env.PATH ?? '',
        CI: 'true',
        GITHUB_ACTIONS: 'true',
        GH_TOKEN: '',
        GITHUB_TOKEN: '',
        PUBLISH_FOR_PULL_REQUEST: 'false',
      },
      encoding: 'utf8',
    },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /BUILD_ONLY_CI_VERIFIED/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { parseRemoteAppOnly, resolveAppBuildMode } from '../scripts/app-build-mode.mjs';
import { REMOTE_APP_ONLY, parsePackagedAppMode } from '../dist-electron/app-mode.js';
const require = createRequire(import.meta.url);
const {load} = require('js-yaml');

test('build flag is explicit, defaults to full, and rejects ambiguous values',()=>{
 for(const value of [undefined,'','false'])assert.equal(parseRemoteAppOnly(value),false);
 assert.equal(parseRemoteAppOnly('true'),true);
 for(const value of ['1','yes','TRUE','false;echo unsafe'])assert.throws(()=>parseRemoteAppOnly(value),/must be true or false/);
});
test('build environment wins over env files and production/development resolve consistently',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'cowork-app-mode-')),before=process.env.REMOTE_APP_ONLY;
 try{
  delete process.env.REMOTE_APP_ONLY;
  assert.equal(resolveAppBuildMode('production',directory).remoteAppOnly,false);
  await writeFile(join(directory,'.env'),'REMOTE_APP_ONLY=true\n');
  assert.equal(resolveAppBuildMode('production',directory).remoteAppOnly,true);
  assert.equal(resolveAppBuildMode('development',directory).remoteAppOnly,true);
  process.env.REMOTE_APP_ONLY='false';assert.equal(resolveAppBuildMode('production',directory).remoteAppOnly,false);
  process.env.REMOTE_APP_ONLY='true';assert.equal(resolveAppBuildMode('production',directory).remoteAppOnly,true);
 }finally{if(before===undefined)delete process.env.REMOTE_APP_ONLY;else process.env.REMOTE_APP_ONLY=before;await rm(directory,{recursive:true,force:true});}
});
test('packaged mode survives launch-time environment changes and rejects corrupt metadata',async()=>{
 const config=JSON.parse(await readFile(new URL('../dist-electron/build-mode.json',import.meta.url),'utf8'));
 assert.equal(REMOTE_APP_ONLY,config.remoteAppOnly);
 for(const value of [null,{}, {schemaVersion:1,remoteAppOnly:'true'}, {schemaVersion:2,remoteAppOnly:false}])assert.throws(()=>parsePackagedAppMode(value),/metadata/);
 assert.equal(parsePackagedAppMode({schemaVersion:1,remoteAppOnly:true}),true);
 assert.equal(parsePackagedAppMode({schemaVersion:1,remoteAppOnly:false}),false);
 const before=process.env.REMOTE_APP_ONLY;process.env.REMOTE_APP_ONLY=String(!config.remoteAppOnly);
 try{assert.equal(REMOTE_APP_ONLY,config.remoteAppOnly);}finally{if(before===undefined)delete process.env.REMOTE_APP_ONLY;else process.env.REMOTE_APP_ONLY=before;}
});
test('manual CI switch propagates to all platform builds with distinct remote-only artifacts',async()=>{
 const workflow=load(await readFile(new URL('../.github/workflows/build.yml',import.meta.url),'utf8'));
 const input=workflow.on.workflow_dispatch.inputs.remote_app_only;assert.equal(input.type,'boolean');assert.equal(input.default,false);
 assert.match(workflow.env.REMOTE_APP_ONLY,/workflow_dispatch/);assert.match(workflow.env.REMOTE_APP_ONLY,/inputs.remote_app_only/);
 for(const id of ['build-windows','build-linux','build-macos-arm64']){
  const steps=workflow.jobs[id].steps;assert(steps.some(s=>s.run?.startsWith('bun run dist:')));
  assert.match(steps.find(s=>s.uses?.startsWith('actions/upload-artifact@')).with.name,/remote-only/);
 }
 assert.deepEqual(workflow.permissions,{contents:'read'});assert.match(workflow.env.CSC_IDENTITY_AUTO_DISCOVERY,/false/);
});
test('remote-only main keeps the remote service and guards local automatic features',async()=>{
 const main=await readFile(new URL('../src/electron/main/index.ts',import.meta.url),'utf8');
 assert.match(main,/if \(!REMOTE_APP_ONLY\)\s*\{\s*expressServer\(mainWindow\);\s*void initializeBridges\(\);/);
 assert.match(main,/initializeRemoteAccessService\(mainWindow\)/);
 const scheduler=await readFile(new URL('../src/electron/services/scheduler/bootstrap.ts',import.meta.url),'utf8');assert.match(scheduler,/if \(REMOTE_APP_ONLY \|\| initialized\) return/);
 const app=await readFile(new URL('../src/ui/App.tsx',import.meta.url),'utf8');assert.match(app,/IS_REMOTE_APP_ONLY \? <RemoteOnlyApp \/> : <FullApp \/>/);
 const remote=await readFile(new URL('../src/ui/features/remote-only/RemoteOnlyApp.tsx',import.meta.url),'utf8');assert.doesNotMatch(remote,/useSessionController|useZohoEmail|useAutoRecoverStuckRuns|StartSessionModal|SessionNotifications/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnWithLauncher } from '../dist-electron/services/client-tools/runners/shell/shellRunner.js';

test('trusted launch hook fires only for a successfully spawned child',async()=>{
 let child;
 const result=await spawnWithLauncher([process.execPath,'-e','process.stdout.write("fixture-ok")'],{cwd:process.cwd(),env:process.env,timeoutMs:5000,onSpawn:p=>{child=p;}});
 assert.ok(child?.pid);assert.equal(result.stdout,'fixture-ok');
 let failedCalled=false;
 await assert.rejects(spawnWithLauncher(['/missing-lifecycle-fixture-executable'],{cwd:process.cwd(),env:process.env,timeoutMs:1000,onSpawn:()=>{failedCalled=true;}}));
 assert.equal(failedCalled,false);
});
test('abort escalates even after SIGTERM marked the child killed', {skip:process.platform==='win32'},async()=>{
 const ctrl=new AbortController();const started=Date.now();
 const result=spawnWithLauncher([process.execPath,'-e','process.on("SIGTERM",()=>{});process.stdout.write("ready");setInterval(()=>{},1000)'],{cwd:process.cwd(),env:process.env,timeoutMs:10000,signal:ctrl.signal,onOutput:chunk=>{if(chunk.includes('ready'))ctrl.abort();}});
 await assert.rejects(result,/aborted/i);
 assert.ok(Date.now()-started<6000);
});

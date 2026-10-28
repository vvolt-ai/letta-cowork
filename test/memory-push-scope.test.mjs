import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createScopedMemory} from '../dist-electron/services/memfs/scoped-memory.js';
import {executeAgentMemory} from '../dist-electron/services/memfs/agent-memory-access.js';
const AGENT='agent-11111111-1111-1111-1111-111111111111',SHA='a'.repeat(40);
test('readonly Vera memory push is refused without requesting a write or changing a commit',async()=>{
 const root=await fs.mkdtemp(join(await fs.realpath(tmpdir()),'memory-push-scope-'));
 try{
  // A memory instance that has never synced cannot acquire a publication grant.
  const memory=createScopedMemory({agentId:AGENT,baseURL:'https://fixture.invalid/letta/runtime',apiKey:'fixture',cacheRoot:root,fetch:async()=>{throw Error('No real network allowed');}});
  await assert.rejects(memory.push({confirm:false,expectedRevision:SHA}),/CONFIRMATION_REQUIRED/);
  await assert.rejects(memory.push({confirm:true,expectedRevision:'HEAD'}),/EXPECTED_REVISION/);
  await assert.rejects(memory.push({confirm:true,expectedRevision:SHA}),/MEMORY_AUTH_REVALIDATION_REQUIRED/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('push controls are not ignored or routed through read-only callbacks',async()=>{
 let reads=0,writes=0;const access={snapshot:async()=>({agentId:AGENT}),refresh:async()=>({agentId:AGENT}),withRead:async()=>{reads++;throw Error('Read callback must not publish');},push:async request=>{writes++;assert.equal(request.confirm,true);assert.equal(request.expectedRevision,SHA);return{agentId:AGENT,repository:'memory',state:'pushed',revision:SHA,remoteRevision:SHA,verified:true};}};
 const result=await executeAgentMemory({action:'push',confirm:true,expectedRevision:SHA},access,AGENT);assert.equal(result.verified,true);assert.equal(writes,1);assert.equal(reads,0);
 await assert.rejects(executeAgentMemory({action:'push',confirm:true,expectedRevision:SHA,path:'system/human.md'},access,AGENT),/INVALID_MEMORY_PUSH/);
 await assert.rejects(executeAgentMemory({action:'sync',confirm:true},access,AGENT),/INVALID_MEMORY_ACTION_ARGUMENT/);
});

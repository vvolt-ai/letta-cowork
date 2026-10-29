import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createScopedMemory} from '../dist-electron/services/memfs/scoped-memory.js';
import {executeAgentMemory} from '../dist-electron/services/memfs/agent-memory-access.js';
const AGENT='agent-11111111-1111-1111-1111-111111111111',SHA='a'.repeat(40);
test('disabled memory says disabled, not that an explicit sync can fix it',async()=>{
 const memory=createScopedMemory({agentId:AGENT,disabled:true,baseURL:'https://fixture.invalid',apiKey:'fixture-only'});assert.equal((await memory.snapshot()).state,'disabled');await assert.rejects(memory.withRead('memory',async()=>{}),/AGENT_MEMORY_DISABLED/);await assert.rejects(memory.push({confirm:true,expectedRevision:SHA}),/AGENT_MEMORY_DISABLED/);assert.equal((await memory.sync()).state,'disabled');
});
test('explicit sync still enables same-agent read/publication capability and does not remove local data',async()=>{
 const root=await fs.mkdtemp(join(await fs.realpath(tmpdir()),'explicit-memory-fixture-'));try{
  await fs.mkdir(join(root,'reference'));const file=join(root,'reference','fixture.md');await fs.writeFile(file,'---\ndescription: Synthetic memory\n---\nPreserved fixture');let prepared=false,syncs=0,pushes=0;
  const snapshot=()=>({agentId:AGENT,state:prepared?'cached':'unavailable',memoryDir:prepared?root:null,sharedDiscovery:'verified',repositories:prepared?[{name:'memory',isPrimary:true,path:root,state:'cached',revision:SHA}]:[]});
  const access={snapshot:async()=>snapshot(),refresh:async()=>{syncs++;prepared=true;return snapshot();},withRead:async(_repo,read)=>{if(!prepared)throw Error('MEMORY_SYNC_REQUIRED');return read(snapshot());},push:async request=>{assert.equal(prepared,true);assert.equal(request.expectedRevision,SHA);pushes++;return{verified:true,state:'pushed'};}};
  await assert.rejects(executeAgentMemory({action:'read',path:'reference/fixture.md'},access,AGENT),/MEMORY_SYNC_REQUIRED/);assert.equal(syncs,0);await executeAgentMemory({action:'sync'},access,AGENT);assert.equal(syncs,1);const read=await executeAgentMemory({action:'read',path:'reference/fixture.md'},access,AGENT);assert.match(read.content,/Preserved fixture/);await executeAgentMemory({action:'push',confirm:true,expectedRevision:SHA},access,AGENT);assert.equal(pushes,1);assert.match(await fs.readFile(file,'utf8'),/Preserved fixture/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

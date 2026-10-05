import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { runWithRuntimeContext, getRuntimeContext, getCurrentWorkingDirectory, getCurrentAgentId, setRuntimeContext } from '../dist-electron/services/client-tools/runners/_shared/runtime-context.js';

test('concurrent async tool flows retain their own identity and CWD', async () => {
 const root = await mkdtemp(join(tmpdir(), 'ctx-isolation-'));
 try {
  const a=join(root,'a'), b=join(root,'b'); await mkdir(a); await mkdir(b);
  const values=await Promise.all([
   runWithRuntimeContext({agentId:'agent-a',conversationId:'conv-a',workingDirectory:a},async()=>{await delay(20); return [getCurrentAgentId(),getCurrentWorkingDirectory(),getRuntimeContext().conversationId];}),
   runWithRuntimeContext({agentId:'agent-b',conversationId:'conv-b',workingDirectory:b},async()=>{await delay(5); setRuntimeContext({...getRuntimeContext(),agentId:'agent-b2'}); await delay(30); return [getCurrentAgentId(),getCurrentWorkingDirectory(),getRuntimeContext().conversationId];})
  ]);
  assert.deepEqual(values,[['agent-a',a,'conv-a'],['agent-b2',b,'conv-b']]);
  assert.equal(getRuntimeContext(), undefined);
 } finally { await rm(root,{recursive:true,force:true}); }
});
test('nested context does not overwrite its parent after completion or failure', async()=>{
 await runWithRuntimeContext({agentId:'parent'},async()=>{
  await assert.rejects(runWithRuntimeContext({agentId:'child'},async()=>{await delay(1); assert.equal(getCurrentAgentId(),'child'); throw new Error('expected');}));
  assert.equal(getCurrentAgentId(),'parent');
 });
});

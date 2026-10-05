import test from 'node:test';
import assert from 'node:assert/strict';
import { OwnedBackgroundMap } from '../dist-electron/services/client-tools/runners/_shared/owned-background-map.js';
import { runWithRuntimeContext } from '../dist-electron/services/client-tools/runners/_shared/runtime-context.js';

test('background lookup and stop isolate agent/conversation/account scope',()=>{
 const entries=new OwnedBackgroundMap();
 const owner={agentId:'agent-a',conversationId:'conv-a',lettaConnectionId:'account-a'};
 runWithRuntimeContext(owner,()=>entries.set('job',{status:'running'}));
 runWithRuntimeContext({...owner,conversationId:'conv-b'},()=>{assert.equal(entries.get('job'),undefined);assert.equal(entries.delete('job'),false);assert.throws(()=>entries.set('job',{status:'running'}),/another scope/);});
 runWithRuntimeContext({...owner,lettaConnectionId:'account-b'},()=>assert.equal(entries.get('job'),undefined));
 assert.equal(entries.get('job'),undefined);
 runWithRuntimeContext(owner,()=>{assert.equal(entries.get('job').owner.agentId,'agent-a');assert.equal(entries.delete('job'),true);});
});
test('legacy entries are not readable by authenticated runtime flows',()=>{
 const entries=new OwnedBackgroundMap(); entries.set('legacy',{});
 assert.ok(entries.get('legacy'));
 runWithRuntimeContext({agentId:'agent-a',conversationId:'conv-a'},()=>assert.equal(entries.get('legacy'),undefined));
 runWithRuntimeContext({agentId:'agent-a'},()=>assert.throws(()=>entries.set('incomplete',{}),/concrete runtime/));
});

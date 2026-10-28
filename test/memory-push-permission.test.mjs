import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanUseToolHandler} from '../dist-electron/libs/runner/permission-handler.js';
import {PlanModeManager} from '../dist-electron/libs/runner/plan-mode/mode-manager.js';
import {agentMemoryTool} from '../dist-electron/services/client-tools/runners/agentMemory.js';
const agentId='agent-11111111-1111-1111-1111-111111111111';
test('memory reads remain read-only but publication needs standard-mode approval',async()=>{
 const session={id:'fixture',pendingPermissions:new Map(),permissionGrants:{allowAll:false,allowedTools:new Set()}};let requestId;
 const handler=createCanUseToolHandler(session,id=>{requestId=id;},'standard');assert.equal((await handler('AgentMemory',{action:'status'})).behavior,'allow');assert.equal(requestId,undefined);
 const pending=handler('AgentMemory',{action:'push',confirm:true,expectedRevision:'a'.repeat(40)});assert(requestId);session.pendingPermissions.get(requestId).resolve({behavior:'deny',message:'fixture deny'});assert.equal((await pending).behavior,'deny');
});
test('plan mode cannot publish even if action includes confirmation',()=>{
 const mode=new PlanModeManager();mode.setMode('plan');assert.equal(mode.checkPermission('AgentMemory',{action:'push',confirm:true}).decision,'deny');assert.equal(mode.checkPermission('AgentMemory',{action:'status'}).decision,'allow');
});
test('an unverified push result is an error receipt, not success inferred from tool completion',async()=>{
 const result=await agentMemoryTool.run({action:'push',confirm:true,expectedRevision:'a'.repeat(40)},{agentId,signal:new AbortController().signal,agentMemory:{snapshot:async()=>({agentId}),refresh:async()=>({agentId}),push:async()=>({agentId,repository:'memory',state:'unverified',revision:'a'.repeat(40),verified:false,errorCode:'MEMORY_PUSH_OUTCOME_UNVERIFIED'})}});assert.equal(result.isError,true);assert.equal(JSON.parse(result.output).verified,false);
});

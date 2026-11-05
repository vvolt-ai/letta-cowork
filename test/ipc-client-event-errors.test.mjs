import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {observeClientEvent,safeClientEventFailure} from '../dist-electron/ipc/observe-client-event.js';
import {stopConversationVerified,assertConversationStopVerified} from '../dist-electron/ipc/handlers/session/verified-stop.js';

test('successful async client event is unchanged and produces no error report',async()=>{
 const event={type:'fixture'},seen=[];await observeClientEvent(event,async value=>{assert.equal(value,event);seen.push('handled');},()=>seen.push('error'));assert.deepEqual(seen,['handled']);
});
test('async rejection is observed at the event boundary, not left to ipcMain.on',async()=>{
 const error=Error('SDK_STOP_NOT_VERIFIED'),seen=[];await observeClientEvent({type:'session.stop'},async()=>{throw error;},(e,event)=>seen.push({e,type:event.type}));assert.equal(seen.length,1);assert.equal(seen[0].e,error);assert.equal(seen[0].type,'session.stop');
});
test('synchronous handler failure is also observed',async()=>{
 let errors=0;await observeClientEvent({},()=>{throw Error('fixture sync');},()=>{errors++;});assert.equal(errors,1);
});
test('a failed synchronous or asynchronous reporter cannot generate another unhandled rejection',async()=>{
 for(const report of [()=>{throw Error('fixture logger');},async()=>{throw Error('fixture async logger');}])await observeClientEvent({},async()=>{throw Error('fixture dispatch');},report);
});
test('failed Stop still prevents Stop-and-continue and leaves the safety fence intact',async()=>{
 const id='ipc-stop-error-fixture',phases=[],errors=[];let continuations=0;
 await observeClientEvent({type:'session.stopAndContinue'},async()=>{await stopConversationVerified(id,{capture:()=>({abort:async()=>false}),publish:phase=>phases.push(phase)});continuations++;},e=>errors.push(safeClientEventFailure(e)));
 assert.equal(continuations,0);assert.deepEqual(phases,['stopping','unverified']);assert.deepEqual(errors,['SDK_STOP_NOT_VERIFIED']);assert.throws(()=>assertConversationStopVerified(id),/STOP_NOT_VERIFIED/);
});
test('diagnostic code never returns arbitrary errors, response bodies or tokens',()=>{
 assert.equal(safeClientEventFailure(Error('SDK_STOP_NOT_VERIFIED')),'SDK_STOP_NOT_VERIFIED');assert.equal(safeClientEventFailure(Error('SDK_STOP_SCOPE_UNAVAILABLE')),'SDK_STOP_SCOPE_UNAVAILABLE');assert.equal(safeClientEventFailure(Error('private credential body https://private.invalid')),'CLIENT_EVENT_FAILED');assert.equal(safeClientEventFailure('private text'),'CLIENT_EVENT_FAILED');
});
test('production IPC listener observes the dispatch promise and runner-finally rejects are caught',()=>{
 const ipc=readFileSync(new URL('../src/electron/ipc/index.ts',import.meta.url),'utf8'),creation=readFileSync(new URL('../src/electron/ipc/handlers/session/session-creation.ts',import.meta.url),'utf8');assert.match(ipc,/void observeClientEvent\(event, handleClientEvent/);assert.match(creation,/handle\.done\.finally\([\s\S]*?\}\)\.catch\(\(\) => undefined\)/);
});

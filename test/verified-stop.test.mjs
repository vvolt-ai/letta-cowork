import test from 'node:test';
import assert from 'node:assert/strict';
import {stopConversationVerified,assertConversationStopVerified,findCanonicalStopHandle,recordConversationMessageAdmission} from '../dist-electron/ipc/handlers/session/verified-stop.js';
import {enqueueConversationTurn,cancelQueuedConversationTurns} from '../dist-electron/ipc/handlers/session/conversation-turn-queue.js';
const defer=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));let seq=0;
const context=()=>({id:'stop-fixture-'+(++seq),events:[]});
const bindings=(f,abort)=>({capture:()=>({abort}),publish:(phase,requestId)=>f.events.push({phase,requestId})});

test('Stop shows stopping, never Idle/verified before owned cancellation actually settles',async()=>{
 const f=context(),gate=defer(),stop=stopConversationVerified(f.id,bindings(f,async()=>{await gate.promise;return true;}));await tick();assert.deepEqual(f.events.map(e=>e.phase),['stopping']);gate.resolve();await stop;assert.deepEqual(f.events.map(e=>e.phase),['stopping','verified']);assert.doesNotThrow(()=>assertConversationStopVerified(f.id));
});
test('false fallback is unverified failure and never emits a verified stop',async()=>{
 const f=context();await assert.rejects(stopConversationVerified(f.id,bindings(f,async()=>false)),/STOP_NOT_VERIFIED/);assert.deepEqual(f.events.map(e=>e.phase),['stopping','unverified']);assert.throws(()=>assertConversationStopVerified(f.id),/STOP_NOT_VERIFIED/);
});
test('failed stop preserves independent requests accepted during cancellation without replaying the old turn',async()=>{
 const f=context(),gate=defer();let submissions=0;const stop=stopConversationVerified(f.id,bindings(f,async()=>{await gate.promise;throw Error('private cancel failure');}));void stop.catch(()=>{});assert.equal(recordConversationMessageAdmission(f.id).afterStop,true);const queued=enqueueConversationTurn(f.id,async()=>{submissions++;});gate.resolve();await assert.rejects(stop,/STOP_NOT_VERIFIED/);await queued;assert.equal(submissions,1);assert.equal(f.events.at(-1).phase,'unverified');assert.throws(()=>assertConversationStopVerified(f.id),/NOT_VERIFIED/);
});
test('a failed stop is diagnostic history, not a fence against a future explicit request',async()=>{
 const f=context();await assert.rejects(stopConversationVerified(f.id,bindings(f,async()=>false)));assert.equal(recordConversationMessageAdmission(f.id).afterStop,true);let admitted=0;await enqueueConversationTurn(f.id,async()=>{admitted++;});assert.equal(admitted,1);assert.throws(()=>assertConversationStopVerified(f.id),/NOT_VERIFIED/);
});
test('Stop after a new admitted turn captures its current controller rather than an old failed target',async()=>{
 const f=context();let old=0,current=0;await assert.rejects(stopConversationVerified(f.id,bindings(f,async()=>{old++;return false;})));recordConversationMessageAdmission(f.id);await stopConversationVerified(f.id,bindings(f,async()=>{current++;return true;}));assert.equal(old,1);assert.equal(current,1);assert.equal(f.events.at(-1).phase,'verified');
});
test('retry retains the exact original failed target rather than resolving a new handle/account',async()=>{
 const f=context();let attempts=0,captures=0,foreign=0;const original={capture:()=>{captures++;return{abort:async()=>++attempts>1};},publish:(phase,requestId)=>f.events.push({phase,requestId})};await assert.rejects(stopConversationVerified(f.id,original));await stopConversationVerified(f.id,{capture:()=>{foreign++;throw Error('Should not select another owner');},publish:original.publish});assert.equal(captures,1);assert.equal(foreign,0);assert.equal(attempts,2);assert.equal(f.events.at(-1).phase,'verified');assert.notEqual(f.events[0].requestId,f.events[2].requestId);assert.doesNotThrow(()=>assertConversationStopVerified(f.id));
});
test('concurrent Stop clicks share one target operation and one barrier',async()=>{
 const f=context(),gate=defer();let attempts=0;const b=bindings(f,async()=>{attempts++;await gate.promise;return true;});const first=stopConversationVerified(f.id,b),second=stopConversationVerified(f.id,b);assert.equal(first,second);await tick();assert.equal(attempts,1);gate.resolve();await Promise.all([first,second]);assert.deepEqual(f.events.map(e=>e.phase),['stopping','verified']);
});
test('Stop interrupts the active turn outside its FIFO and publishes before a queued successor starts',async()=>{
 const f=context(),turn=defer(),trace=[];const old=enqueueConversationTurn(f.id,async()=>{trace.push('old');await turn.promise;trace.push('old-cleaned');});await tick();const stop=stopConversationVerified(f.id,{capture:()=>({abort:async()=>{trace.push('abort');turn.resolve();return true;}}),publish:phase=>trace.push(phase)});const next=enqueueConversationTurn(f.id,async()=>{assertConversationStopVerified(f.id);trace.push('next');});await Promise.all([old,stop,next]);assert(trace.indexOf('abort')<trace.indexOf('old-cleaned'));assert(trace.indexOf('verified')>trace.indexOf('old-cleaned'));assert(trace.indexOf('next')>trace.indexOf('verified'));
});
test('waiting or failed A cancellation cannot block unrelated B',async()=>{
 const a=context(),b=context(),gate=defer();const stop=stopConversationVerified(a.id,bindings(a,async()=>{await gate.promise;return false;}));void stop.catch(()=>{});let bRan=false;await enqueueConversationTurn(b.id,async()=>{assertConversationStopVerified(b.id);bRan=true;});assert(bRan);gate.resolve();await assert.rejects(stop);assert.equal(b.events.length,0);
});
test('a newer Stop/Delete generation suppresses stale final Idle publication',async()=>{
 const f=context(),gate=defer(),b=bindings(f,async()=>{await gate.promise;return true;});const stop=stopConversationVerified(f.id,b);await tick();cancelQueuedConversationTurns(f.id);gate.resolve();await stop;assert.deepEqual(f.events.map(e=>e.phase),['stopping']);await stopConversationVerified(f.id,b);assert.equal(f.events.at(-1).phase,'verified');
});
test('lost renderer delivery cannot prevent exact cancellation or fabricate failure',async()=>{
 const f=context();let attempts=0;await stopConversationVerified(f.id,{capture:()=>({abort:async()=>{attempts++;return true;}}),publish:()=>{throw Error('fixture renderer closed');}});assert.equal(attempts,1);assert.doesNotThrow(()=>assertConversationStopVerified(f.id));
});
test('captured SDK fallback clears only its disposed exact target and not a default agent',async()=>{
 const {DesktopSdkSession}=await import('../dist-electron/libs/runner/sdk/session.js'),{findOwnedAbortTarget,abortCapturedSession}=await import('../dist-electron/libs/runner/abort-handler.js'),{storeSession,getSession}=await import('../dist-electron/libs/runner/state.js');const id='conv-11111111-1111-1111-1111-111111111111',s=new DesktopSdkSession({agentId:'agent-22222222-2222-2222-2222-222222222222',conversationId:id});storeSession(id,s);assert.equal(findOwnedAbortTarget(id),s);assert.equal(await abortCapturedSession('conv-foreign',s),false);assert.equal(findOwnedAbortTarget(id),s);assert.equal(await abortCapturedSession(id,s),true);assert.equal(getSession(id),undefined);
});
test('failed captured abort keeps its exact owner/state entry for another explicit verification attempt',async()=>{
 const {DesktopSdkSession}=await import('../dist-electron/libs/runner/sdk/session.js'),{findOwnedAbortTarget,abortCapturedSession}=await import('../dist-electron/libs/runner/abort-handler.js'),{storeSession,getSession}=await import('../dist-electron/libs/runner/state.js');const id='conv-33333333-3333-3333-3333-333333333333',s=new DesktopSdkSession({conversationId:id}),original=s.abort.bind(s);storeSession(id,s);s.abort=async()=>{throw Error('unverified fixture');};await assert.rejects(abortCapturedSession(id,s),/unverified/);assert.equal(getSession(id),s);assert.equal(findOwnedAbortTarget(id),s);s.abort=original;assert.equal(await abortCapturedSession(id,s),true);assert.equal(getSession(id),undefined);
});
test('ambiguous SDK controller selection never chooses one of two accounts by raw conversation ID',async()=>{
 const {DesktopSdkSession}=await import('../dist-electron/libs/runner/sdk/session.js'),{findOwnedAbortTarget}=await import('../dist-electron/libs/runner/abort-handler.js');const id='conv-44444444-4444-4444-4444-444444444444',a=new DesktopSdkSession({conversationId:id}),b=new DesktopSdkSession({conversationId:id});assert.equal(findOwnedAbortTarget(id),undefined);await Promise.all([a.abort(),b.abort()]);
});
test('missing controller keeps admission fenced but never caches an invented false target',async()=>{
 const f=context();let captures=0;const publish=(phase,requestId,code)=>f.events.push({phase,requestId,code});await assert.rejects(stopConversationVerified(f.id,{capture:()=>{captures++;return undefined;},publish}),/SDK_STOP_SCOPE_UNAVAILABLE/);assert.throws(()=>assertConversationStopVerified(f.id),/NOT_VERIFIED/);assert.equal(f.events.at(-1).code,'SDK_STOP_SCOPE_UNAVAILABLE');await stopConversationVerified(f.id,{capture:()=>{captures++;return{abort:async()=>true};},publish});assert.equal(captures,2);assert.doesNotThrow(()=>assertConversationStopVerified(f.id));assert.equal(f.events.at(-1).phase,'verified');
});
test('canonical handle selection rejects ambiguous or mis-keyed controllers',()=>{
 const handle=id=>({sessionId:id,abort:async()=>{},done:Promise.resolve()}),a=handle('A'),b=handle('A');assert.equal(findCanonicalStopHandle(new Map([['alias',a]]),'A'),a);assert.throws(()=>findCanonicalStopHandle(new Map([['A',handle('B')]]),'A'),/SCOPE_UNAVAILABLE/);assert.throws(()=>findCanonicalStopHandle(new Map([['first',a],['second',b]]),'A'),/SCOPE_UNAVAILABLE/);assert.equal(findCanonicalStopHandle(new Map([['A',a],['alias',a]]),'A'),a);
});

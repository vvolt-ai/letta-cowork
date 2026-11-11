import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocketServer } from 'ws';
import { DesktopSdkSession } from '../dist-electron/libs/runner/sdk/session.js';
import { DesktopNativeControls } from '../dist-electron/libs/runner/sdk/native-controls.js';
import { SdkToolScheduler } from '../dist-electron/libs/runner/sdk/tool-scheduler.js';
import {
  processGroupHasLiveMembers,
  waitForNativeGroup,
} from '../dist-electron/services/letta-runtime/native-host.js';
test('denied group probes wait for independent exit evidence without claiming termination', async () => {
  let probes = 0;
  assert.equal(await waitForNativeGroup(() => (++probes < 3 ? 'unverified' : 'gone'), 150), 'gone');
  assert.ok(probes >= 3);
  assert.equal(await waitForNativeGroup(() => 'unverified', 25), 'unverified');
  assert.equal(await waitForNativeGroup(() => 'alive', 25), 'alive');
});
test('process cleanup never treats a live or uninspectable group as zombie-only', () => {
  assert.equal(processGroupHasLiveMembers(' 101 100 Z\n 102 100 Z+\n 10 10 Ss', 100), false);
  assert.equal(processGroupHasLiveMembers(' 101 100 Z\n 102 100 S', 100), true);
  assert.equal(processGroupHasLiveMembers(' 10 10 Ss', 100), false);
  assert.throws(() => processGroupHasLiveMembers('', 100), /INSPECTION_EMPTY/);
  assert.throws(() => processGroupHasLiveMembers('unexpected output', 100), /INSPECTION_INVALID/);
});
import { registerClientTool } from '../dist-electron/services/client-tools/index.js';
import { createCanUseToolHandler } from '../dist-electron/libs/runner/permission-handler.js';
import { consumeAttachmentApproval } from '../dist-electron/services/client-tools/runners/_shared/attachmentApproval.js';
test(
  'SDK delegation of protected attachment tool preserves a fresh single-use human decision even in Full Access',
  { timeout: 15000 },
  async () => {
    // Synthetic protected tool: the retired Odoo transport is not registered.
    const odooAttachmentTool = {name:'OdooAttachPdf',description:'Fixture human approval only',parameters:{type:'object',properties:{}},run:async()=>({output:'unused'})};
    const unregister=registerClientTool(odooAttachmentTool);
    let effects = 0,
      prompts = 0;
    odooAttachmentTool.run = async (args, ctx) => {
      effects++;
      assert.equal(consumeAttachmentApproval(ctx.attachmentApproval, args), true);
      assert.equal(consumeAttachmentApproval(ctx.attachmentApproval, args), false);
      return {
        output: 'Fixture protected decision consumed; no ERP write performed.',
        isError: false,
      };
    };
    const pendingPermissions = new Map();
    const session = {
      id: 'guarded-sdk',
      title: 'Fixture',
      status: 'running',
      pendingPermissions,
      permissionGrants: { allowAll: true, allowedTools: new Set(['OdooAttachPdf']) },
    };
    const policy = createCanUseToolHandler(
      session,
      (id, name) => {
        prompts++;
        assert.equal(name, 'OdooAttachPdf');
        pendingPermissions.get(id).resolve({ behavior: 'allow' });
      },
      'unrestricted',
    );
    const f = await fixture(true),
      s = f.make({ tools: ['OdooAttachPdf'], canUseTool: policy });
    try {
      await s.send('Fixture protected attachment approval only.');
      for await (const _ of s.stream()) {
      }
      assert.equal(effects, 1);
      assert.equal(prompts, 1);
      assert.equal(pendingPermissions.size, 0);
      await s.abort();
    } finally {
      await s.abort().catch(() => undefined);
      unregister();
      await f.close();
    }
  },
);
const A = 'agent-11111111-1111-1111-1111-111111111111',
  C = 'conv-22222222-2222-2222-2222-222222222222',
  R = 'run-fixture',
  runtime = { agent_id: A, conversation_id: C };
const conversation = { id: C, agent_id: A, model: 'fixture-model' };
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function fixture(tool = false, conflict = false, terminalReason = 'end_turn', options = {}) {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await once(server, 'listening');
  const frames = [],
    responses = [];
  let submissions = 0;
  let finishActive, startActive, publishQueue, sendFrame;
  let backendReads = 0, bindingCloses = 0;
  server.on('connection', (ws) => {
    let alias,
      finished = false, abortSeen = false;
    const reply = (m) => ws.send(JSON.stringify(m));
    const finish = () => {
      if (finished) return;
      finished = true;
      if (abortSeen && !options.abortFinishedRace) reply({type:'update_loop_status',runtime,loop_status:{status:'WAITING_ON_INPUT',active_run_ids:[],executing_tool_call_ids:[],client_message_ids_by_run_id:{}}});
      if (options.idleOnly) return;
      reply({
        type: 'stream_delta',
        runtime,
        delta: { message_type: 'assistant_message', run_id: R, content: 'Fixture answer' },
      });
      reply({
        type: 'turn_finished',
        runtime,
        run_id: R,
        turn_id: 'turn-fixture',
        stop_reason: terminalReason,
      });
      if (options.lateNativeErrorHint) reply({type:'turn_finished',runtime,run_id:R,turn_id:'turn-fixture',stop_reason:'llm_api_error'});
    };
    const active = (messageId, foreign = false) => {
      reply({type:'update_loop_status',runtime,loop_status:{status:'PROCESSING_API_RESPONSE',active_run_ids:foreign?['run-foreign']:[R],executing_tool_call_ids:[],client_message_ids_by_run_id:foreign?{'run-foreign':['foreign-input']}:{[R]:[messageId]}}});
      if (!foreign) reply({type:'stream_delta',runtime,delta:{message_type:'reasoning_message',run_id:R,reasoning:'Fixture turn evidence'}});
    };
    const queue = (messageId) => reply({
      type: 'update_queue', runtime,
      queue: [
        { id: 'queue-foreign', client_message_id: 'foreign-input', content: 'foreign' },
        ...(options.foreignQueueOnly ? [] : [{ id: 'queue-owned', client_message_id: messageId, content: 'owned' }]),
      ],
    });
    ws.on('message', (bytes) => {
      const m = JSON.parse(bytes);
      frames.push(m);
      if (m.type === 'app_server_info')
        reply({
          type: 'app_server_info_response',
          request_id: m.request_id,
          success: true,
          backend: 'api',
          letta_code_version: '0.34.51',
          protocol_version: 1,
          capabilities: {
            agent_management: true,
            conversation_management: true,
            memory_management: true,
            runtime_start: true,
            split_channels: false,
          },
        });
      else if (m.type === 'conversation_retrieve')
        reply({
          type: 'conversation_retrieve_response',
          request_id: m.request_id,
          success: true,
          conversation,
        });
      else if (m.type === 'runtime_start') {
        alias = m.external_tools?.[0]?.tools?.[0]?.name;
        reply({
          type: 'runtime_start_response',
          request_id: m.request_id,
          success: true,
          runtime,
          agent: { id: A, model: 'fixture-model', tools: [] },
          execution_settings: m.execution_settings,
        });
      } else if (m.type === 'input') {
        submissions++;
        const messageId = m.payload.messages[0].client_message_id;
        finishActive = finish;
        startActive = () => active(messageId, options.foreignActive);
        publishQueue = () => queue(messageId);
        sendFrame = reply;
        if (options.queued || options.foreignQueueOnly) {
          if (options.foreignActive) active(messageId, true);
          queue(messageId);
          return;
        }
        startActive();
        if (options.sdkEndBeforeNative) {
          reply({type:'stream_delta',runtime,delta:{message_type:'assistant_message',run_id:R,content:'Fixture early answer'}});
          reply({type:'stream_delta',runtime,delta:{message_type:'loop_error',run_id:R,is_terminal:true,stop_reason:'llm_api_error',message:'Fixture terminal error before native correlation'}});
          return;
        }
        if (!tool) {
          if (!options.hold) finish();
          return;
        }
        for (const [i, target] of [
          [0, 'fixture'],
          [1, conflict ? 'changed' : 'fixture'],
        ])
          reply({
            type: 'external_tool_call_request',
            runtime,
            request_id: 'rpc-' + i,
            tool_call_id: 'repeat-id',
            tool_name: alias,
            input: { target },
          });
      } else if (m.type === 'external_tool_call_response') {
        responses.push(m);
        if (responses.length === 2 && !options.hold) finish();
      } else if (m.type === 'sync') {
        reply({ type: 'sync_response', request_id: m.request_id, success: true, runtime });
      } else if (m.type === 'abort_message') {
        abortSeen = true;
        reply({ type: 'abort_message_response', request_id: m.request_id, success: true, runtime });
        if (!options.ackOnly) finish();
      } else if (m.type === 'remove_queue_item') {
        if (options.removeRace) startActive();
        reply({ type: 'remove_queue_item_response', request_id: m.request_id, runtime,
          item_id: m.item_id, success: !options.removeRace });
      }
      else if (m.request_id)
        reply({
          type: m.type + '_response',
          request_id: m.request_id,
          success: false,
          error: 'Unexpected fixture control',
        });
    });
  });
  const scope = {
    key: 'fixture-scope',
    config: { baseURL: 'http://127.0.0.1:1', apiKey: 'fixture-only-key', source: 'local' },
    assertCurrent: () => undefined,
    client: {
      conversations: { retrieve: async () => conversation, update: async () => conversation },
      runs: { retrieve: async id => {
        backendReads++;
        if (frames.some(frame=>frame.type==='abort_message')) return {id,status:options.backendTerminalStatus??(options.abortFinishedRace?'completed':'cancelled'),agent_id:A,conversation_id:C};
        if (options.backendError) throw Error('Fixture backend unavailable');
        return new Promise(() => {});
      } },
    },
  };
  const dependencies = {
    launch: async () => ({
      url: 'ws://127.0.0.1:' + server.address().port,
      authToken: 'fixture-only-token',
      close: async () => { bindingCloses++; },
    }),
  };
  const make = (extra = {}, overrides = {}) =>
    new DesktopSdkSession(
      {
        agentId: A,
        conversationId: C,
        scope,
        memoryDisabled: true,
        inheritedContext: { signal: new AbortController().signal, runtimeEnv: {} },
        tools: tool ? ['DesktopSdkReceiptFixture'] : [],
        canUseTool: async () => ({ behavior: 'allow' }),
        ...extra,
      },
      { ...dependencies, stopTimeoutMs: 20, ...overrides },
    );
  return {
    make,
    scope,
    frames,
    responses,
    get submissions() {
      return submissions;
    },
    get backendReads() { return backendReads; },
    get bindingCloses() { return bindingCloses; },
    finish: () => finishActive(),
    start: () => startActive(),
    queue: () => publishQueue(),
    emit: (frame) => sendFrame(frame),
    close: async () => {
      for (const ws of server.clients) ws.terminate();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
const deferred = () => {
  let resolve;
  const promise = new Promise((yes) => { resolve = yes; });
  return { promise, resolve };
};
async function until(predicate, message = 'Fixture condition not observed') {
  const deadline = Date.now() + 2000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, message);
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}
async function collect(session) {
  const events = [];
  for await (const event of session.stream()) events.push(event);
  return events;
}
function spyNative(session) {
  const native = session.native;
  const calls = { streams: 0, aborts: 0, closes: 0, sdkCloses: 0, order: [] };
  const stream = native.stream, abort = native.abort, close = native.close;
  const sdkClose = session.sdk.close;
  native.stream = function (...args) {
    assert.equal(this, native);
    calls.streams++;
    return stream.apply(this, args);
  };
  native.abort = function (...args) {
    assert.equal(this, native);
    assert.equal(args.length, 0, 'Use the installed public abort, not a private run-id control');
    calls.aborts++;
    calls.order.push('abort');
    return abort.apply(this, args);
  };
  native.close = function (...args) {
    calls.closes++;
    calls.order.push('native-close');
    if (!session.queueRemovalConfirmed) {
      assert.equal(session.sdkTerminalSeen, true, 'Do not close before the SDK result');
      assert.equal(session.pumpFinished, true, 'Do not close while the sole SDK pump is draining');
    }
    return close.apply(this, args);
  };
  session.sdk.close = function (...args) {
    calls.sdkCloses++;
    calls.order.push('sdk-close');
    return sdkClose.apply(this, args);
  };
  return calls;
}

for (const backendError of [false, true]) {
  test(`valid SDK terminal ignores ${backendError ? 'erroring' : 'hung'} backend reads without replay`, { timeout: 5000 }, async () => {
    const f = await fixture(false, false, 'end_turn', { backendError });
    const s = f.make();
    try {
      await s.initialize();
      const calls = spyNative(s);
      await s.send('fixture');
      const events = await collect(s);
      const results = events.filter((event) => event.type === 'result');
      assert.equal(results.length, 1);
      assert.equal(results[0].success, true);
      assert.equal(results[0].clientRunId, s.controls.messageId);
      assert.equal(s.isVerified, true);
      await s.abort();
      assert.equal(f.backendReads, 0);
      assert.equal(f.submissions, 1);
      assert.equal(calls.streams, 1);
      assert.equal(calls.aborts, 0, 'Terminal cleanup is not cancellation');
      assert.deepEqual(calls.order, ['native-close', 'sdk-close']);
    } finally {
      await s.abort().catch(() => undefined);
      await f.close();
    }
  });
}

test('raw native hints do not rewrite the authoritative SDK result fields',async()=>{
 const f=await fixture(false,false,'end_turn',{lateNativeErrorHint:true}),s=f.make();
 try{await s.send('fixture');const result=(await collect(s)).find(m=>m.type==='result');
 // Deliver the raw late hint deterministically: normal completion may already
 // dispose the socket before a second wire frame reaches its listener.
 s.controls.incoming(JSON.stringify({type:'turn_finished',runtime:{agent_id:A,conversation_id:C},run_id:R,turn_id:'turn-fixture',stop_reason:'llm_api_error'}));
 assert.equal(result.success,true);assert.equal(result.stopReason,'end_turn');assert.equal(result.error,undefined);assert.equal(result.errorCode,undefined);assert.equal(s.controls.stopReason,'llm_api_error');await s.abort();assert.equal(f.submissions,1);}finally{await s.abort().catch(()=>{});await f.close();}
});
test('unsolicited SDK results and foreign run content do not complete or label the current UI turn',async()=>{
 const f=await fixture(),s=f.make();try{
  await s.initialize();const original=s.native.stream.bind(s.native);
  s.native.stream=async function*(){yield{type:'assistant',content:'foreign output',runId:'run-foreign'};yield{type:'result',success:true,origin:'cron'};yield* original();};
  await s.send('fixture');const events=await collect(s);
  assert(!events.some(event=>event.type==='assistant'&&event.content==='foreign output'));
  assert.equal(events.filter(event=>event.type==='result').length,1);
  assert.equal(events.find(event=>event.type==='result').success,true);
 }finally{await s.abort().catch(()=>{});await f.close();}
});
test('an expired owned backend run settles Stop without converting interruption into success',async()=>{const f=await fixture(false,false,'end_turn',{hold:true,backendTerminalStatus:'expired'}),s=f.make();try{await s.initialize();await s.send('fixture');await until(()=>s.controls.ownedRuns.has(R));const collected=collect(s);await s.abort();const result=(await collected).find(m=>m.type==='result');assert.equal(result.success,false);assert.equal(result.stopReason,'interrupted');assert.equal(s.isVerified,true);assert(f.backendReads>0);assert.equal(f.submissions,1);}finally{await s.abort().catch(()=>{});await f.close();}});
test('local callbacks drain before the original SDK terminal reaches UI or close', { timeout: 5000 }, async () => {
  const f = await fixture(), s = f.make(), work = deferred();
  try {
    await s.initialize();
    const calls = spyNative(s);
    s.work.add(work.promise);
    await s.send('fixture');
    let delivered = false;
    const events = collect(s).then((value) => { delivered = true; return value; });
    await until(() => s.sdkTerminalSeen);
    assert.equal(delivered, false);
    assert.equal(s.isVerified, false);
    const stop = s.abort();
    await tick();
    assert.equal(calls.closes, 0);
    work.resolve();
    const [messages] = await Promise.all([events, stop]);
    assert.equal(messages.filter((m) => m.type === 'result').length, 1);
    assert.equal(f.backendReads, 0);
    assert.equal(calls.streams, 1);
    assert.equal(calls.aborts, 0);
    assert.equal(calls.closes, 1);
    assert.equal(f.submissions, 1);
  } finally {
    work.resolve();
    await s.abort().catch(() => undefined);
    await f.close();
  }
});

test('active Stop uses the exact public native instance and preserves interruption after tool signal abort', { timeout: 5000 }, async () => {
  const f = await fixture(false, false, 'end_turn', { hold: true }), s = f.make();
  try {
    await s.initialize();
    const calls = spyNative(s);
    await s.send('fixture');
    await until(() => s.controls.ownedRuns.has(R));
    const firstUi = s.stream();
    assert.equal((await firstUi.next()).done, false);
    await firstUi.return();
    // UI unsubscribe/re-subscribe must never create another native consumer.
    const messages = collect(s);
    const stop = s.abort();
    assert.equal(s.ctrl.signal.aborted, true);
    await stop;
    const results = (await messages).filter((m) => m.type === 'result');
    assert.equal(results.length, 1);
    assert.equal(results[0].success, false);
    assert.equal(results[0].stopReason, 'interrupted', 'SDK markAbortRequested overrides fixture end_turn');
    assert.equal(calls.aborts, 1);
    assert.equal(calls.streams, 1);
    assert.deepEqual(calls.order, ['abort', 'native-close', 'sdk-close']);
    const abortFrame = f.frames.find((m) => m.type === 'abort_message');
    assert.deepEqual(abortFrame.runtime, runtime);
    assert.equal('run_id' in abortFrame, false);
    assert(f.backendReads > 0, 'Keep host alive until the native backend cancellation settles');
    assert.equal(f.submissions, 1);
  } finally {
    await s.abort().catch(() => undefined);
    await f.close();
  }
});

test('SDK interruption receipt after abort and scoped idle needs no raw turn_finished but waits for backend cancel delivery',async()=>{
 const f=await fixture(false,false,'end_turn',{hold:true,idleOnly:true}),s=f.make();
 try{await s.initialize();const calls=spyNative(s);await s.send('fixture');await until(()=>s.controls.ownedRuns.has(R));const messages=collect(s);await s.abort();const result=(await messages).find(m=>m.type==='result');assert.equal(result.stopReason,'interrupted');assert.equal(result.success,false);assert(s.isVerified);assert.equal(calls.streams,1);assert.equal(calls.aborts,1);assert(f.backendReads>0);}finally{await s.abort().catch(()=>{});await f.close();}
});
test('SDK natural completion may win the Stop race and is not rewritten as interruption',async()=>{
 const f=await fixture(false,false,'end_turn',{hold:true,abortFinishedRace:true}),s=f.make();
 try{await s.initialize();const calls=spyNative(s);await s.send('fixture');await until(()=>s.controls.ownedRuns.has(R));s.close();assert.equal(calls.closes,0);assert.equal(calls.aborts,0);assert.equal(s.ctrl.signal.aborted,false);const messages=collect(s);await s.abort();const result=(await messages).find(m=>m.type==='result');assert.equal(result.success,true);assert.equal(result.stopReason,'end_turn');assert.equal(calls.aborts,1);assert.equal(f.submissions,1);}finally{await s.abort().catch(()=>{});await f.close();}
});
test('abort ACK alone times out, fences the next controller and closes only after late SDK terminal plus retry', { timeout: 5000 }, async () => {
  const f = await fixture(false, false, 'end_turn', { hold: true, ackOnly: true }), s = f.make();
  let newer, after;
  try {
    await s.initialize();
    const calls = spyNative(s);
    await s.send('fixture');
    await until(() => s.controls.ownedRuns.has(R));
    const messages = collect(s);
    await assert.rejects(s.abort(), /SDK_TERMINAL_RESULT_TIMEOUT/);
    assert.equal(s.ctrl.signal.aborted, true);
    assert.equal(s.sdkTerminalSeen, false);
    assert.equal(s.isVerified, false);
    assert.equal(calls.closes, 0);
    assert.equal(calls.sdkCloses, 0);
    assert.equal(f.bindingCloses, 0);
    newer = f.make();
    await assert.rejects(newer.initialize(), /ALREADY_OWNED/);
    await newer.abort();
    f.finish();
    const results = (await messages).filter((m) => m.type === 'result');
    assert.equal(results.length, 1);
    assert.equal(results[0].success, false);
    assert.equal(results[0].stopReason, 'interrupted');
    assert.equal(calls.closes, 0, 'Late terminal must not silently dispose the fenced owner');
    await s.abort();
    assert.equal(s.isVerified, true);
    assert.equal(calls.aborts, 1, 'Retry drains original result, never aborts or sends again');
    assert.equal(calls.streams, 1);
    assert.equal(calls.closes, 1);
    assert.equal(calls.sdkCloses, 1);
    after = f.make();
    await after.initialize();
    await after.abort();
    assert.equal(f.submissions, 1);
    assert(f.backendReads > 0);
  } finally {
    if (f.submissions) f.finish();
    await s.abort().catch(() => undefined);
    await newer?.abort().catch(() => undefined);
    await after?.abort().catch(() => undefined);
    await f.close();
  }
});

for (const foreignActive of [false, true]) {
  test(`queued Stop removes exact own SDK item without abort${foreignActive ? ' while foreign work stays active' : ''}`, { timeout: 5000 }, async () => {
    const f = await fixture(false, false, 'end_turn', { queued: true, foreignActive }), s = f.make();
    try {
      await s.initialize();
      const calls = spyNative(s);
      await s.send('fixture');
      await until(() => s.controls.ownQueuedItem() === 'queue-owned');
      // These are SDK-normalized camelCase items, received from real snake_case wire frames.
      const update = s.events.find((m) => m.type === 'queue_update');
      assert.equal(update.queue.find((q) => q.id === 'queue-owned').clientMessageId, s.controls.messageId);
      await s.abort();
      assert.equal(s.isVerified, true);
      assert.equal(s.sdkTerminalSeen, false, 'Acknowledged queued removal needs no active-run terminal');
      assert.equal(s.queueRemovalConfirmed, true);
      assert.equal(calls.aborts, 0);
      assert.equal(calls.streams, 1);
      assert.equal(calls.closes, 1);
      assert.deepEqual(f.frames.filter((m) => m.type === 'remove_queue_item').map((m) => m.item_id), ['queue-owned']);
      assert.equal(f.frames.some((m) => m.type === 'abort_message'), false);
      assert.equal(f.submissions, 1);
      assert.equal(f.backendReads, 0);
    } finally {
      await s.abort().catch(() => undefined);
      await f.close();
    }
  });
}

test('queued removal-start race rechecks owned active run before public abort', { timeout: 5000 }, async () => {
  const f = await fixture(false, false, 'end_turn', { queued: true, removeRace: true }), s = f.make();
  try {
    await s.initialize();
    const calls = spyNative(s);
    await s.send('fixture');
    await until(() => s.controls.ownQueuedItem() === 'queue-owned');
    const messages = collect(s);
    await s.abort();
    const results = (await messages).filter((m) => m.type === 'result');
    assert.equal(results.length, 1);
    assert.equal(results[0].success, false);
    assert.equal(results[0].stopReason, 'interrupted');
    const controls = f.frames.filter((m) => ['sync', 'remove_queue_item', 'abort_message'].includes(m.type));
    assert.deepEqual(controls.map((m) => m.type), ['sync', 'remove_queue_item', 'sync', 'abort_message']);
    assert.equal(controls[1].item_id, 'queue-owned');
    assert.equal(calls.aborts, 1);
    assert.equal(calls.streams, 1);
    assert.equal(f.submissions, 1);
  } finally {
    await s.abort().catch(() => undefined);
    await f.close();
  }
});

test('foreign queued input is never selected or broadly aborted; owner remains fenced', { timeout: 5000 }, async () => {
  const f = await fixture(false, false, 'end_turn', { foreignQueueOnly: true }), s = f.make();
  try {
    await s.initialize();
    const calls = spyNative(s);
    await s.send('fixture');
    await until(() => s.events.some((m) => m.type === 'queue_update'));
    await assert.rejects(s.abort(), /SDK_ABORT_SCOPE_UNVERIFIED/);
    assert.equal(calls.aborts, 0);
    assert.equal(calls.closes, 0);
    assert.equal(s.isVerified, false);
    assert.equal(f.frames.some((m) => ['abort_message', 'remove_queue_item'].includes(m.type)), false);
    // The owned input can later start independently; cleanup drains it, with no new send.
    f.start();
    await until(() => s.controls.ownedRuns.has(R));
    f.finish();
    const results = (await collect(s)).filter((m) => m.type === 'result');
    assert.equal(results.length, 1);
    await s.abort();
    assert.equal(calls.aborts, 0);
    assert.equal(f.submissions, 1);
  } finally {
    if (f.submissions) { f.start(); f.finish(); }
    await s.abort().catch(() => undefined);
    await f.close();
  }
});

test('late native correlation after a consumed SDK result permits exact Stop cleanup without result replay',{timeout:5000},async()=>{
 const f=await fixture(false,false,'llm_api_error',{sdkEndBeforeNative:true}),s=f.make();
 try{
   await s.initialize();const calls=spyNative(s);await s.send('fixture');
   await assert.rejects(collect(s),/SDK_STOP_UNVERIFIED/);
   assert(s.sdkTerminalSeen);assert(s.pumpFinished);assert.equal(s.isVerified,false);
   const next=f.make();await assert.rejects(next.initialize(),/ALREADY_OWNED/);await next.abort();
   f.finish();await until(()=>s.controls.hasTerminalProof());await s.abort();
   assert(s.isVerified);assert.equal(calls.aborts,0);assert.equal(calls.streams,1);assert.equal(calls.closes,1);assert.equal(f.submissions,1);assert.equal(f.backendReads,0);
 }finally{f.finish();await s.abort().catch(()=>{});await f.close();}
});
test('native error terminal remains failed without backend verification or model replay', { timeout: 5000 }, async () => {
  const f = await fixture(false, false, 'llm_api_error'), s = f.make();
  try {
    await s.send('fixture');
    const results = (await collect(s)).filter((m) => m.type === 'result');
    assert.equal(results.length, 1);
    assert.equal(results[0].success, false);
    await s.abort();
    assert.equal(f.backendReads, 0);
    assert.equal(f.submissions, 1);
  } finally {
    await s.abort().catch(() => undefined);
    await f.close();
  }
});

test('terminal diagnostics are scoped, validate the frame and cannot affect ownership',()=>{
 const stages=[],c=new DesktopNativeControls(A,C,undefined,stage=>stages.push(stage)),scope={agent_id:A,conversation_id:C};c.outgoing(JSON.stringify({type:'input',runtime:scope,request_id:'fixture',payload:{kind:'create_message',messages:[{client_message_id:c.messageId}]}}));
 c.incoming(JSON.stringify({type:'turn_finished',runtime:{agent_id:A,conversation_id:'conv-foreign'},run_id:R,turn_id:'fixture',stop_reason:'end_turn'}));c.incoming(JSON.stringify({type:'turn_finished',runtime:scope,stop_reason:'end_turn'}));assert.deepEqual(stages,[]);c.incoming(JSON.stringify({type:'turn_finished',runtime:scope,run_id:R,turn_id:'fixture',stop_reason:'end_turn'}));assert.deepEqual(stages,['native_terminal_received']);assert.equal(c.hasTerminalProof(),false);
});

for (const conflict of [false, true])
  test(
    'SDK callback receipts prevent repeated effects' +
      (conflict ? ' and reject changed arguments' : ''),
    { timeout: 15000 },
    async () => {
      let effects = 0,
        approvals = 0;
      const dispose = registerClientTool({
        name: 'DesktopSdkReceiptFixture',
        description: 'Fixture',
        parameters: { type: 'object', properties: { target: { type: 'string' } } },
        run: async () => {
          effects++;
          await tick();
          return { output: 'receipt', isError: false };
        },
      });
      const f = await fixture(true, conflict),
        s = f.make({
          canUseTool: async () => {
            approvals++;
            return { behavior: 'allow' };
          },
        });
      try {
        await s.send('fixture');
        for await (const _ of s.stream()) {
        }
        assert.equal(effects, 1);
        assert.equal(approvals, 1);
        assert.equal(f.submissions, 1);
        assert.equal(f.responses.length, 2);
        if (conflict)
          assert.ok(
            f.responses.some((m) => m.result?.isError || m.result?.is_error || m.error),
            JSON.stringify(f.responses),
          );
        await s.abort();
      } finally {
        await s.abort().catch(() => undefined);
        dispose();
        await f.close();
      }
    },
  );
test('cancellation before initialization prevents any native launch or late send', async () => {
  let launch = 0;
  const s = new DesktopSdkSession(
    { agentId: A, conversationId: C },
    {
      launch: async () => {
        launch++;
        throw Error('Should not launch');
      },
    },
  );
  await s.abort();
  await assert.rejects(s.send('late'), /SESSION_CLOSED/);
  assert.equal(launch, 0);
});
test('cancellation during canonical lookup cannot create a late native runtime', async () => {
  let resolveLookup,
    launch = 0;
  const lookup = new Promise((resolve) => {
    resolveLookup = resolve;
  });
  const scope = {
    key: 'deferred-scope',
    config: { baseURL: 'http://fixture', apiKey: 'fixture', source: 'local' },
    assertCurrent: () => undefined,
    client: { conversations: { retrieve: () => lookup } },
  };
  const s = new DesktopSdkSession(
    { agentId: A, conversationId: C, scope },
    {
      launch: async () => {
        launch++;
        throw Error('Should not launch');
      },
    },
  );
  const init = s.initialize();
  const rejected = assert.rejects(init, /SESSION_CLOSED/);
  const stopped = s.abort();
  resolveLookup(conversation);
  await rejected;
  await stopped;
  assert.equal(launch, 0);
});
test('resuming without an explicit agent ignores a changed global default', async () => {
  const previous = process.env.LETTA_AGENT_ID;
  process.env.LETTA_AGENT_ID = 'agent-other-default';
  const f = await fixture(),
    s = f.make({ agentId: undefined });
  try {
    const ready = await s.initialize();
    assert.equal(ready.agentId, A);
    assert.equal(ready.conversationId, C);
    const start = f.frames.find((frame) => frame.type === 'runtime_start');
    assert.equal(start.agent_id, A);
    assert.equal(f.submissions, 0);
    await s.abort();
  } finally {
    if (previous === undefined) delete process.env.LETTA_AGENT_ID;
    else process.env.LETTA_AGENT_ID = previous;
    await s.abort().catch(() => undefined);
    await f.close();
  }
});
test('new conversations still use an explicitly configured default agent', async () => {
  const previous = process.env.LETTA_AGENT_ID;
  process.env.LETTA_AGENT_ID = A;
  const f = await fixture();
  let created = 0;
  f.scope.client.conversations.create = async (body) => {
    created++;
    assert.equal(body.agent_id, A);
    return conversation;
  };
  const s = f.make({ agentId: undefined, conversationId: undefined });
  try {
    const ready = await s.initialize();
    assert.equal(ready.agentId, A);
    assert.equal(created, 1);
    await s.abort();
  } finally {
    if (previous === undefined) delete process.env.LETTA_AGENT_ID;
    else process.env.LETTA_AGENT_ID = previous;
    await s.abort().catch(() => undefined);
    await f.close();
  }
});
test('explicit agent/conversation ownership mismatch remains rejected', async () => {
  const f = await fixture(),
    s = f.make({ agentId: 'agent-explicit-other' });
  try {
    await assert.rejects(s.initialize(), /SDK_CONVERSATION_AGENT_MISMATCH/);
    assert.equal(f.frames.filter((frame) => frame.type === 'runtime_start').length, 0);
    assert.equal(f.submissions, 0);
  } finally {
    await s.abort().catch(() => undefined);
    await f.close();
  }
});

test('native settlement requires correlated runs and detects changed/mixed ownership', () => {
  const c = new DesktopNativeControls(A, C);
  c.outgoing(
    JSON.stringify({
      type: 'input',
      runtime,
      request_id: 'input',
      payload: { kind: 'create_message', messages: [{ client_message_id: c.messageId }] },
    }),
  );
  assert.throws(() => c.snapshot(), /STOP_UNVERIFIED/);
  const status = (ids) =>
    c.incoming(
      JSON.stringify({
        type: 'update_loop_status',
        runtime,
        loop_status: { client_message_ids_by_run_id: { [R]: ids } },
      }),
    );
  status([c.messageId]);
  assert.throws(() => c.snapshot(), /STOP_UNVERIFIED/);
  c.incoming(
    JSON.stringify({
      type: 'turn_finished',
      runtime,
      run_id: R,
      turn_id: 'turn',
      stop_reason: 'end_turn',
    }),
  );
  const proof = c.snapshot();
  assert.deepEqual(proof.runs, [R]);
  status([c.messageId, 'foreign-input']);
  assert.throws(() => c.assertSnapshot(proof), /OWNERSHIP_MIXED/);
});
test('native step budgets must be acknowledged and never grant arbitrary native tools', () => {
  const c = new DesktopNativeControls(A, C, 25);
  const start = JSON.parse(
    c.outgoing(
      JSON.stringify({
        type: 'runtime_start',
        agent_id: A,
        conversation_id: C,
        external_tools: [{ tools: [{ name: 'private-alias' }] }],
      }),
    ),
  );
  assert.deepEqual(start.execution_settings.allowed_tools, ['private-alias']);
  assert.equal(start.execution_settings.max_turns, 25);
  const reply = JSON.parse(
    c.incoming(
      JSON.stringify({
        type: 'runtime_start_response',
        runtime,
        success: true,
        execution_settings: { ...start.execution_settings, max_turns: 100 },
      }),
    ),
  );
  assert.equal(reply.success, false);
  assert.throws(() => c.assertExclusive(), /BUDGET_NOT_ACKNOWLEDGED/);
});
test('SDK callback scheduler serializes same-file effects and does not lock a delegating parent', async () => {
  const scheduler = new SdkToolScheduler(),
    order = [];
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  const a = scheduler.run('Edit', { file_path: 'same.ts' }, '/fixture', async () => {
    order.push('first');
    await held;
    order.push('first-done');
  });
  const b = scheduler.run('Edit', { file_path: 'same.ts' }, '/fixture', async () => {
    order.push('second');
  });
  await tick();
  assert.deepEqual(order, ['first']);
  release();
  await Promise.all([a, b]);
  assert.deepEqual(order, ['first', 'first-done', 'second']);
  await scheduler.run('Task', {}, '/fixture', () =>
    scheduler.run('Bash', {}, '/fixture', async () => order.push('child')),
  );
  assert.equal(order.at(-1), 'child');
});

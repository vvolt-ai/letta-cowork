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
const A = 'agent-11111111-1111-1111-1111-111111111111',
  C = 'conv-22222222-2222-2222-2222-222222222222',
  R = 'run-fixture',
  runtime = { agent_id: A, conversation_id: C };
const conversation = { id: C, agent_id: A, model: 'fixture-model' };
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function fixture(tool = false, conflict = false) {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await once(server, 'listening');
  const frames = [],
    responses = [];
  let submissions = 0,
    status = 'completed';
  server.on('connection', (ws) => {
    let alias,
      finished = false;
    const reply = (m) => ws.send(JSON.stringify(m));
    const finish = () => {
      if (finished) return;
      finished = true;
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
        stop_reason: 'end_turn',
      });
    };
    ws.on('message', (bytes) => {
      const m = JSON.parse(bytes);
      frames.push(m);
      if (m.type === 'app_server_info')
        reply({
          type: 'app_server_info_response',
          request_id: m.request_id,
          success: true,
          backend: 'api',
          letta_code_version: '0.34.20',
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
        reply({
          type: 'update_loop_status',
          runtime,
          loop_status: {
            status: 'PROCESSING_API_RESPONSE',
            active_run_ids: [R],
            executing_tool_call_ids: [],
            client_message_ids_by_run_id: {
              [R]: m.payload.messages.map((p) => p.client_message_id),
            },
          },
        });
        if (!tool) {
          finish();
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
        if (responses.length === 2) finish();
      } else if (m.type === 'sync')
        reply({ type: 'sync_response', request_id: m.request_id, success: true, runtime });
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
      runs: { retrieve: async (id) => ({ id, status, agent_id: A, conversation_id: C }) },
    },
  };
  const dependencies = {
    launch: async () => ({
      url: 'ws://127.0.0.1:' + server.address().port,
      authToken: 'fixture-only-token',
      close: async () => undefined,
    }),
  };
  const make = (extra = {}) =>
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
      dependencies,
    );
  return {
    make,
    scope,
    frames,
    responses,
    get submissions() {
      return submissions;
    },
    setStatus: (value) => {
      status = value;
    },
    close: async () => {
      for (const ws of server.clients) ws.terminate();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
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
test(
  'requires_approval readback fences successors; failed stop is retryable without new input',
  { timeout: 20000 },
  async () => {
    const f = await fixture(),
      s = f.make();
    f.setStatus('requires_approval');
    try {
      await s.send('fixture');
      await assert.rejects(async () => {
        for await (const _ of s.stream()) {
        }
      }, /NOT_VERIFIED_TERMINAL/);
      const newer = f.make();
      await assert.rejects(newer.initialize(), /ALREADY_OWNED/);
      await newer.abort();
      await assert.rejects(s.abort(), /NOT_VERIFIED_TERMINAL/);
      f.setStatus('completed');
      await s.abort();
      assert.equal(f.submissions, 1);
      const after = f.make();
      await after.initialize();
      await after.abort();
    } finally {
      f.setStatus('completed');
      await s.abort().catch(() => undefined);
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

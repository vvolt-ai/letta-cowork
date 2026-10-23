import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { DesktopSdkSession } from '../dist-electron/libs/runner/sdk/session.js';
import {
  startDesktopAppServer,
  desktopNativeEnvironment,
} from '../dist-electron/services/letta-runtime/native-host.js';
import { registerClientTool } from '../dist-electron/services/client-tools/index.js';
const A = 'agent-11111111-1111-1111-1111-111111111111',
  C = 'conv-22222222-2222-2222-2222-222222222222',
  R = 'run-33333333-3333-3333-3333-333333333333';
const agent = {
  id: A,
  name: 'Fixture',
  agent_type: 'letta_v1_agent',
  model: 'openai/gpt-test',
  tags: [],
  tools: [],
  tool_rules: [],
  system: 'Fixture only',
  memory: { blocks: [] },
  llm_config: { model: 'gpt-test', model_endpoint_type: 'openai', context_window: 32000 },
  embedding_config: {
    embedding_model: 'fixture',
    embedding_endpoint_type: 'openai',
    embedding_dim: 1536,
  },
};
const conversation = {
  id: C,
  agent_id: A,
  model: 'openai/gpt-test',
  created_at: new Date().toISOString(),
};
function sse(res, body) {
  res.write('data: ' + JSON.stringify(body) + '\n\n');
}
async function fixture(useTool = false, stopReason = 'end_turn', delayMs = 0) {
  const requests = [],
    paths = [];
  let calls = 0;
  const api = createServer(async (req, res) => {
    paths.push(req.method + ' ' + req.url);
    let text = '';
    for await (const data of req) text += data;
    const body = text ? JSON.parse(text) : {};
    const path = new URL(req.url, 'http://fixture').pathname;
    if (req.method === 'POST' && path.endsWith('/messages')) {
      requests.push(body);
      calls++;
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
      if (useTool && calls === 1) {
        const tool = (body.client_tools ?? []).find((tool) => tool.name?.startsWith('cowork_'));
        sse(res, {
          id: 'message-tool',
          message_type: 'approval_request_message',
          run_id: R,
          tool_call: {
            tool_call_id: 'fixture-tool-call',
            name: tool?.name ?? 'missing-alias',
            arguments: '{"target":"fixture"}',
          },
        });
        sse(res, { message_type: 'stop_reason', run_id: R, stop_reason: 'requires_approval' });
      } else {
        sse(res, {
          id: 'message-final',
          message_type: 'assistant_message',
          run_id: R,
          content: 'Native SDK fixture answer',
        });
        sse(res, { message_type: 'stop_reason', run_id: R, stop_reason: stopReason });
      }
      res.end('data: [DONE]\n\n');
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    if (path.includes('/agents/' + A)) res.end(JSON.stringify(agent));
    else if (path.endsWith('/runs/' + R))
      res.end(JSON.stringify({ id: R, status: 'completed', agent_id: A, conversation_id: C }));
    else if (path.endsWith('/recompile')) res.end(JSON.stringify('Fixture prompt'));
    else if (path.includes('/conversations/' + C))
      res.end(JSON.stringify(path.endsWith('/messages') ? [] : conversation));
    else if (path.includes('/models')) res.end(JSON.stringify({ models: [] }));
    else res.end(JSON.stringify([]));
  });
  api.listen(0, '127.0.0.1');
  await once(api, 'listening');
  const url = 'http://127.0.0.1:' + api.address().port;
  return {
    requests,
    paths,
    url,
    close: async () => {
      api.closeAllConnections();
      await new Promise((resolve) => api.close(resolve));
    },
  };
}
async function run(useTool, options = {}) {
  const api = await fixture(useTool, options.stopReason, options.delayMs),
    root = await fs.mkdtemp(join(tmpdir(), 'cowork-native-test-'));
  let executions = 0,
    approvals = 0,
    scopeChecks = 0;
  const dispose = registerClientTool({
    name: 'DesktopSdkFixture',
    description: 'Isolated test fixture',
    parameters: {
      type: 'object',
      properties: { target: { type: 'string' } },
      required: ['target'],
    },
    run: async (args, ctx) => {
      executions++;
      assert.equal(args.target, options.updatedInput ? 'approved' : 'fixture');
      assert.equal(ctx.agentId, A);
      assert.equal(ctx.conversationId, C);
      assert.equal(ctx.workingDirectory, root);
      return { output: 'Fixture effect', isError: false };
    },
  });
  const scope = {
    key: 'native-fixture:' + api.url,
    config: { source: 'local', apiKey: 'fixture-only-key', baseURL: api.url },
    assertCurrent: () => {
      scopeChecks++;
    },
    client: {
      conversations: { retrieve: async () => conversation, update: async () => conversation },
      runs: {
        retrieve: async () => ({ id: R, status: 'completed', agent_id: A, conversation_id: C }),
      },
    },
  };
  const session = new DesktopSdkSession(
    {
      agentId: A,
      conversationId: C,
      cwd: root,
      scope,
      memoryDisabled: true,
      inheritedContext: { signal: new AbortController().signal, runtimeEnv: {} },
      tools: useTool ? ['DesktopSdkFixture'] : [],
      maxTurns: options.maxTurns,
      permissionMode: 'strict',
      canUseTool: async (name, input) => {
        approvals++;
        assert.equal(name, 'DesktopSdkFixture');
        return options.deny
          ? { behavior: 'deny', message: 'Fixture denial' }
          : {
              behavior: 'allow',
              ...(options.updatedInput ? { updatedInput: { target: 'approved' } } : {}),
            };
      },
    },
    {
      launch: (opts) =>
        startDesktopAppServer({
          ...opts,
          profileRoot: root,
          executablePath: process.execPath,
          cliPath: process.env.COWORK_SDK_TEST_PACKAGED_CLI,
        }),
      ...(process.env.COWORK_SDK_TEST_PACKAGED_SDK
        ? {
            open: async (binding, controls) => {
              const { LettaAgentClient } = await import(
                pathToFileURL(process.env.COWORK_SDK_TEST_PACKAGED_SDK).href
              );
              return new LettaAgentClient({
                backend: 'remote',
                url: binding.url,
                authToken: binding.authToken,
                WebSocket: controls.socketConstructor(),
              });
            },
          }
        : {}),
    },
  );
  try {
    if (options.plan) session.planMode.setMode('plan');
    await session.send(
      options.image
        ? [
            { type: 'text', text: 'Describe the attached fixture.' },
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
              },
            },
          ]
        : 'Reply using the fixture only.',
    );
    const events = [];
    for await (const event of session.stream()) events.push(event);
    assert.equal(events.filter((event) => event.type === 'result').length, 1);
    assert.equal(events.at(-1).success, !options.stopReason);
    assert.ok(
      events.some(
        (event) =>
          event.type === 'assistant' && event.content.includes('Native SDK fixture answer'),
      ),
    );
    assert.equal(executions, useTool && !options.deny && !options.plan ? 1 : 0);
    assert.equal(approvals, useTool && !options.plan ? 1 : 0);
    assert.ok(scopeChecks > 3);
    if (options.stopReason) assert.ok(api.requests.length >= 1 && api.requests.length <= 4);
    else assert.equal(api.requests.length, useTool ? 2 : 1);
    if (useTool)
      assert.ok(
        events.some(
          (event) => event.type === 'tool_call' && event.toolName === 'DesktopSdkFixture',
        ),
      );
    if (options.stopReason)
      assert.equal(api.paths.filter((path) => path.includes('/stream')).length, 0);
    if (options.image)
      assert.ok(
        api.requests[0].messages.some(
          (message) =>
            Array.isArray(message.content) &&
            message.content.some((block) => block.type === 'image' || block.type === 'image_url'),
        ),
      );
    await session.abort();
    assert.equal(
      (await fs.readdir(root)).filter((name) => name.startsWith('cowork-sdk-')).length,
      0,
    );
  } finally {
    await session.abort().catch(() => undefined);
    dispose();
    await api.close();
    await fs.rm(root, { recursive: true, force: true });
  }
}
test(
  'native SDK permits model work beyond the management handshake deadline',
  { timeout: 60000 },
  () => run(false, { delayMs: 12000 }),
);
test('native SDK preserves human-corrected approval input', { timeout: 60000 }, () =>
  run(true, { updatedInput: true }),
);
test('native SDK carries image blocks to its API harness', { timeout: 60000 }, () =>
  run(false, { image: true }),
);
test('real SDK and native API harness produce a verified desktop answer', { timeout: 60000 }, () =>
  run(false),
);
test(
  'real SDK runs Cowork tool once and preserves interactive approval continuation',
  { timeout: 60000 },
  () => run(true),
);
test(
  'real native step-limited child callback still obeys Cowork approvals',
  { timeout: 60000 },
  () => run(true, { maxTurns: 25 }),
);
test('real native approval denial causes no local effect', { timeout: 60000 }, () =>
  run(true, { deny: true }),
);
test('plan mode denies a mutating native callback without prompting', { timeout: 60000 }, () =>
  run(true, { plan: true }),
);
test(
  'native terminal error cannot become a successful desktop result or tail-resume',
  { timeout: 60000 },
  () => run(false, { stopReason: 'llm_api_error' }),
);
test('native child environment excludes ambient credentials and agent memory', () => {
  const before = process.env.COWORK_TOKEN;
  process.env.COWORK_TOKEN = 'fixture-private-parent-token';
  try {
    const env = desktopNativeEnvironment(
      '/private-fixture',
      'http://127.0.0.1:1234',
      'relay-only-token',
    );
    assert.equal(env.COWORK_TOKEN, undefined);
    assert.equal(env.AGENT_ID, undefined);
    assert.equal(env.MEMORY_DIR, undefined);
    assert.equal(env.LETTA_API_KEY, 'relay-only-token');
    assert.equal(env.ELECTRON_RUN_AS_NODE, '1');
  } finally {
    if (before === undefined) delete process.env.COWORK_TOKEN;
    else process.env.COWORK_TOKEN = before;
  }
});

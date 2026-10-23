import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DesktopSdkSession,
  getOwnedDesktopSdkSessions,
} from '../dist-electron/libs/runner/sdk/session.js';
import { startDesktopAppServer } from '../dist-electron/services/letta-runtime/native-host.js';
const A = 'agent-11111111-1111-1111-1111-111111111111',
  P = 'conv-22222222-2222-2222-2222-222222222222',
  C = 'conv-44444444-4444-4444-4444-444444444444';
const parent = { id: P, agent_id: A, model: 'openai/gpt-test' },
  child = { ...parent, id: C };
const agent = {
  id: A,
  name: 'Fixture',
  agent_type: 'letta_v1_agent',
  model: 'openai/gpt-test',
  tags: ['git-memory-enabled'],
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
test(
  'Task delegates through a second native SDK runtime with the same account and no recursive tools',
  { timeout: 60000 },
  async () => {
    const root = await fs.mkdtemp(join(tmpdir(), 'cowork-sdk-delegation-'));
    const requests = [],
      paths = [];
    let parentTurns = 0,
      approvals = 0,
      created = 0;
    const api = createServer(async (req, res) => {
      const path = new URL(req.url, 'http://fixture').pathname;
      paths.push(req.method + ' ' + path);
      let raw = '';
      for await (const data of req) raw += data;
      const body = raw ? JSON.parse(raw) : {};
      if (req.method === 'POST' && path.endsWith('/messages')) {
        const isChild = path.includes(C);
        requests.push({
          isChild,
          body,
          account: req.headers['x-letta-connection-id'],
          authorization: req.headers.authorization,
        });
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        const emit = (m) => res.write('data: ' + JSON.stringify(m) + '\n\n');
        const run = isChild ? 'run-child' : 'run-parent';
        if (!isChild && ++parentTurns === 1) {
          const tool = body.client_tools.find((tool) => tool.name.startsWith('cowork_'));
          emit({
            id: 'message-task',
            message_type: 'approval_request_message',
            run_id: run,
            tool_call: {
              tool_call_id: 'task-call',
              name: tool.name,
              arguments: JSON.stringify({
                description: 'Fixture child',
                prompt: 'Reply without tools.',
                subagent_type: 'general-purpose',
              }),
            },
          });
          emit({ message_type: 'stop_reason', run_id: run, stop_reason: 'requires_approval' });
        } else {
          emit({
            id: isChild ? 'message-child' : 'message-parent',
            message_type: 'assistant_message',
            run_id: run,
            content: isChild ? 'Child SDK answer' : 'Parent SDK answer',
          });
          emit({ message_type: 'stop_reason', run_id: run, stop_reason: 'end_turn' });
        }
        res.end('data: [DONE]\n\n');
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      if (path.includes('/agents/' + A)) res.end(JSON.stringify(agent));
      else if (path.endsWith('/recompile')) res.end(JSON.stringify('Fixture prompt'));
      else if (path.includes('/conversations/'))
        res.end(
          JSON.stringify(path.endsWith('/messages') ? [] : path.includes(C) ? child : parent),
        );
      else if (path.includes('/models')) res.end(JSON.stringify({ models: [] }));
      else res.end(JSON.stringify([]));
    });
    api.listen(0, '127.0.0.1');
    await once(api, 'listening');
    const scope = {
      key: 'delegation-fixture',
      config: {
        source: 'local',
        baseURL: 'http://127.0.0.1:' + api.address().port,
        apiKey: 'fixture-only-key',
        defaultHeaders: { 'x-letta-connection-id': 'fixture-account' },
      },
      assertCurrent: () => undefined,
      client: {
        conversations: {
          retrieve: async (id) => (id === C ? child : parent),
          create: async (body) => {
            created++;
            assert.equal(body.agent_id, A);
            return child;
          },
        },
        runs: {
          retrieve: async (id) => ({
            id,
            status: 'completed',
            agent_id: A,
            conversation_id: id === 'run-child' ? C : P,
          }),
        },
      },
    };
    const session = new DesktopSdkSession(
      {
        agentId: A,
        conversationId: P,
        cwd: root,
        scope,
        lettaConnectionId: 'fixture-account',
        memoryDisabled: true,
        inheritedContext: { signal: new AbortController().signal, runtimeEnv: {} },
        tools: ['Task'],
        canUseTool: async (name) => {
          approvals++;
          assert.equal(name, 'Task');
          return { behavior: 'allow' };
        },
      },
      {
        launch: (options) =>
          startDesktopAppServer({
            ...options,
            profileRoot: root,
            executablePath: process.execPath,
          }),
      },
    );
    try {
      await session.send('Delegate to one child.');
      const messages = [];
      for await (const event of session.stream()) messages.push(event);
      assert.equal(created, 1);
      assert.equal(approvals, 1);
      assert.equal(requests.length, 3);
      assert.equal(requests.filter((request) => request.isChild).length, 1);
      const childTools = requests.find((request) => request.isChild).body.client_tools ?? [];
      assert.deepEqual(childTools, []);
      assert.ok(
        messages.some(
          (message) =>
            message.type === 'tool_result' && message.content.includes('Child SDK answer'),
        ),
      );
      assert.equal(messages.at(-1).success, true);
      assert.equal(
        paths.filter(
          (path) =>
            /git|memfs/i.test(path) || (/repositor/i.test(path) && !path.startsWith('GET ')),
        ).length,
        0,
        'No memory transport, provisioning or writes',
      );
      assert.ok(
        requests.every(
          (request) =>
            request.account === 'fixture-account' &&
            request.authorization === 'Bearer fixture-only-key',
        ),
      );
      await session.abort();
      assert.equal(getOwnedDesktopSdkSessions(P).length, 0);
      assert.equal(getOwnedDesktopSdkSessions(C).length, 0);
      assert.deepEqual(
        (await fs.readdir(root)).filter((name) => name.startsWith('cowork-sdk-')),
        [],
      );
    } finally {
      await session.abort().catch(() => undefined);
      api.closeAllConnections();
      await new Promise((resolve) => api.close(resolve));
      await fs.rm(root, { recursive: true, force: true });
    }
  },
);

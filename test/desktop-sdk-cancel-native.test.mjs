import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  DesktopSdkSession,
  getOwnedDesktopSdkSessions,
} from '../dist-electron/libs/runner/sdk/session.js';
import { startDesktopAppServer } from '../dist-electron/services/letta-runtime/native-host.js';
const A = 'agent-11111111-1111-1111-1111-111111111111',
  C = 'conv-22222222-2222-2222-2222-222222222222',
  R = 'run-33333333-3333-3333-3333-333333333333';
const conversation = { id: C, agent_id: A, model: 'openai/gpt-test' };
const agent = {
  id: A,
  name: 'Fixture',
  agent_type: 'letta_v1_agent',
  model: 'openai/gpt-test',
  tags: [],
  tools: [],
  tool_rules: [],
  system: 'Fixture',
  memory: { blocks: [] },
  llm_config: { model: 'gpt-test', model_endpoint_type: 'openai', context_window: 32000 },
  embedding_config: {
    embedding_model: 'fixture',
    embedding_endpoint_type: 'openai',
    embedding_dim: 1536,
  },
};
test(
  'actual native cancellation stops only correlated run IDs and verifies settlement',
  { timeout: 60000 },
  async () => {
    const root = await fs.mkdtemp(join(tmpdir(), 'cowork-sdk-cancel-'));
    let status = 'running',
      stream,
      submissions = 0;
    const cancellations = [],
      paths = [];
    const finish = () => {
      if (stream && !stream.writableEnded) {
        stream.write(
          'data: ' +
            JSON.stringify({ message_type: 'stop_reason', run_id: R, stop_reason: 'cancelled' }) +
            '\n\n',
        );
        stream.end('data: [DONE]\n\n');
      }
    };
    const api = createServer(async (req, res) => {
      const path = new URL(req.url, 'http://fixture').pathname;
      paths.push(req.method + ' ' + path);
      let raw = '';
      for await (const data of req) raw += data;
      const body = raw ? JSON.parse(raw) : {};
      if (req.method === 'POST' && path.endsWith('/messages')) {
        submissions++;
        res.writeHead(200, { 'content-type': 'text/event-stream' });
        stream = res;
        res.write(
          'data: ' +
            JSON.stringify({
              id: 'message-inflight',
              message_type: 'assistant_message',
              run_id: R,
              content: 'Fixture started',
            }) +
            '\n\n',
        );
        return;
      }
      if (path.includes('/cancel')) {
        cancellations.push({ path, body });
        status = 'cancelled';
        finish();
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ id: R, status, agent_id: A, conversation_id: C }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      if (path.includes('/runs/'))
        res.end(JSON.stringify({ id: R, status, agent_id: A, conversation_id: C }));
      else if (path.includes('/agents/' + A)) res.end(JSON.stringify(agent));
      else if (path.endsWith('/recompile')) res.end(JSON.stringify('Fixture prompt'));
      else if (path.includes('/conversations/'))
        res.end(JSON.stringify(path.endsWith('/messages') ? [] : conversation));
      else if (path.includes('/models')) res.end(JSON.stringify({ models: [] }));
      else res.end(JSON.stringify([]));
    });
    api.listen(0, '127.0.0.1');
    await once(api, 'listening');
    const scope = {
      key: 'inflight-fixture',
      config: {
        source: 'local',
        apiKey: 'fixture-only-key',
        baseURL: 'http://127.0.0.1:' + api.address().port,
      },
      assertCurrent: () => undefined,
      client: {
        conversations: { retrieve: async () => conversation },
        runs: { retrieve: async () => ({ id: R, status, agent_id: A, conversation_id: C }) },
      },
    };
    const session = new DesktopSdkSession(
      {
        agentId: A,
        conversationId: C,
        cwd: root,
        scope,
        memoryDisabled: true,
        tools: [],
        inheritedContext: { signal: new AbortController().signal, runtimeEnv: {} },
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
      await session.send('Fixture only');
      for (let i = 0; i < 200 && !session.controls.ownedRuns.size; i++)
        await new Promise((resolve) => setTimeout(resolve, 10));
      assert.deepEqual([...session.controls.ownedRuns], [R]);
      await session.abort();
      assert.equal(submissions, 1);
      assert.ok(cancellations.length > 0, JSON.stringify(paths));
      assert.ok(
        cancellations.every(
          (request) =>
            request.path.includes(R) ||
            JSON.stringify(request.body) === JSON.stringify({ run_ids: [R] }),
        ),
        JSON.stringify(cancellations),
      );
      assert.equal(status, 'cancelled');
      assert.equal(getOwnedDesktopSdkSessions(C).length, 0);
    } finally {
      status = 'cancelled';
      finish();
      await session.abort().catch(() => undefined);
      api.closeAllConnections();
      await new Promise((resolve) => api.close(resolve));
      await fs.rm(root, { recursive: true, force: true });
    }
  },
);

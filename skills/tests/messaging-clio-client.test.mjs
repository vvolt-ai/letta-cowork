import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';

const script = new URL('../messaging-clio/scripts/message-clio.mjs', import.meta.url);
const AGENT_ID = 'agent-800b8961-14e2-4849-acc3-e88129dfc1de';
const CONVERSATION_ID = 'conv-11111111-1111-4111-8111-111111111111';

function runClient(input, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script.pathname], {
      env: {
        ...process.env,
        CLIO_LETTA_API_KEY: 'test-token',
        AGENT_ID: 'agent-22222222-2222-4222-8222-222222222222',
        ...env,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.setEncoding('utf8').on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(JSON.stringify(input));
  });
}

async function withServer(handler, run) {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  try {
    return await run(`http://127.0.0.1:${address.port}/v1`);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

async function jsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

test('creates a conversation, identifies the caller as unverified, and returns Clio reply', async () => {
  const requests = [];
  const result = await withServer(
    async (request, response) => {
      requests.push({
        method: request.method,
        url: request.url,
        authorization: request.headers.authorization,
        body: await jsonBody(request),
      });
      response.setHeader('content-type', 'application/json');
      if (requests.length === 1) {
        response.end(JSON.stringify({ id: CONVERSATION_ID }));
        return;
      }
      response.end(
        JSON.stringify({
          messages: [
            { message_type: 'reasoning_message', content: 'internal' },
            { message_type: 'assistant_message', content: 'Clio reply' },
          ],
          stop_reason: 'end_turn',
        }),
      );
    },
    (baseUrl) =>
      runClient(
        { message: 'Who owns this decision?' },
        { CLIO_LETTA_BASE_URL: baseUrl },
      ),
  );

  assert.equal(result.code, 0, result.stderr);
  assert.equal(requests.length, 2);
  assert.equal(
    requests[0].url,
    `/v1/conversations?agent_id=${encodeURIComponent(AGENT_ID)}`,
  );
  assert.equal(requests[0].authorization, 'Bearer test-token');
  assert.equal(
    requests[1].url,
    `/v1/conversations/${CONVERSATION_ID}/messages`,
  );
  assert.match(
    requests[1].body.messages[0].content,
    /identity_assurance: claimed identity is not independently verified/,
  );
  assert.match(
    requests[1].body.messages[0].content,
    /agent-22222222-2222-4222-8222-222222222222/,
  );
  const output = JSON.parse(result.stdout);
  assert.deepEqual(output, {
    agentId: AGENT_ID,
    conversationId: CONVERSATION_ID,
    reply: 'Clio reply',
    stopReason: 'end_turn',
  });
});

test('reuses an explicit conversation without creating another one', async () => {
  let requests = 0;
  const result = await withServer(
    async (request, response) => {
      requests += 1;
      assert.equal(
        request.url,
        `/v1/conversations/${CONVERSATION_ID}/messages`,
      );
      await jsonBody(request);
      response.setHeader('content-type', 'application/json');
      response.end(
        JSON.stringify({
          messages: [
            {
              role: 'assistant',
              content: [{ type: 'text', text: 'Follow-up reply' }],
            },
          ],
        }),
      );
    },
    (baseUrl) =>
      runClient(
        { conversationId: CONVERSATION_ID, message: 'Follow up' },
        { CLIO_LETTA_BASE_URL: baseUrl },
      ),
  );

  assert.equal(result.code, 0, result.stderr);
  assert.equal(requests, 1);
  assert.equal(JSON.parse(result.stdout).reply, 'Follow-up reply');
});

test('fails safely when the Clio token is unavailable', async () => {
  const result = await runClient(
    { message: 'Hello' },
    { CLIO_LETTA_API_KEY: '' },
  );
  assert.equal(result.code, 1);
  assert.match(result.stderr, /CLIO_LETTA_API_KEY is unavailable/);
  assert.doesNotMatch(result.stderr, /test-token/);
});

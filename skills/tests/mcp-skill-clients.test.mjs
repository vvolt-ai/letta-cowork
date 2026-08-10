import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const neo4jClient = fileURLToPath(
  new URL('../neo4j-mcp/scripts/call-mcp.mjs', import.meta.url),
);
const veraClient = fileURLToPath(
  new URL('../vera-mcp/scripts/call-mcp.mjs', import.meta.url),
);

function runClient(client, tool, input, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [client, tool], {
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        ...env,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => (stdout += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk) => (stderr += chunk));
    child.once('error', reject);
    child.once('close', (code, signal) =>
      resolve({ code, signal, stdout, stderr }),
    );
    child.stdin.end(input);
  });
}

async function startMcpServer() {
  const requests = [];
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    requests.push({
      url: request.url,
      authorization: request.headers.authorization,
      accept: request.headers.accept,
      body,
    });

    if (request.url === '/neo4j-mcp') {
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      response.end(
        `event: message\ndata: ${JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: { content: [{ type: 'text', text: '[{"slug":"graph"}]' }] },
        })}\n\n`,
      );
      return;
    }

    if (request.url === '/mcp-error') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: {
            isError: true,
            content: [{ type: 'text', text: 'Authorized resource not found' }],
          },
        }),
      );
      return;
    }

    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        result: { content: [{ type: 'text', text: '{"user":"test"}' }] },
      }),
    );
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    requests,
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

test('bundled clients call their stateless MCP endpoints with VERA_TOKEN', async (t) => {
  const mock = await startMcpServer();
  t.after(mock.close);

  const env = {
    VERA_TOKEN: 'test-token',
    VERA_SERVER_URL: `${mock.url}/ignored/base/path`,
  };
  const [vera, neo4j] = await Promise.all([
    runClient(veraClient, 'vera_whoami', '{}', env),
    runClient(
      neo4jClient,
      'neo4j_read',
      JSON.stringify({ instance: 'graph', cypher: 'RETURN $value', parameters: { value: 1 } }),
      env,
    ),
  ]);

  assert.equal(vera.code, 0, vera.stderr);
  assert.equal(vera.stdout, '{"user":"test"}\n');
  assert.equal(neo4j.code, 0, neo4j.stderr);
  assert.equal(neo4j.stdout, '[{"slug":"graph"}]\n');
  assert.deepEqual(
    mock.requests.map((entry) => entry.url).sort(),
    ['/mcp', '/neo4j-mcp'],
  );

  for (const request of mock.requests) {
    assert.equal(request.authorization, 'Bearer test-token');
    assert.equal(request.accept, 'application/json, text/event-stream');
    assert.equal(request.body.jsonrpc, '2.0');
    assert.equal(request.body.method, 'tools/call');
  }
  assert.deepEqual(
    mock.requests.find((entry) => entry.url === '/mcp').body.params,
    { name: 'vera_whoami', arguments: {} },
  );
  assert.deepEqual(
    mock.requests.find((entry) => entry.url === '/neo4j-mcp').body.params,
    {
      name: 'neo4j_read',
      arguments: {
        instance: 'graph',
        cypher: 'RETURN $value',
        parameters: { value: 1 },
      },
    },
  );
});

test('explicit endpoint override is supported and MCP tool errors fail', async (t) => {
  const mock = await startMcpServer();
  t.after(mock.close);

  const result = await runClient(veraClient, 'vera_whoami', '{}', {
    VERA_TOKEN: 'test-token',
    VERA_MCP_URL: `${mock.url}/mcp-error`,
  });

  assert.equal(result.code, 1);
  assert.equal(result.stdout, 'Authorized resource not found\n');
  assert.equal(result.stderr, '');
  assert.equal(mock.requests[0].url, '/mcp-error');
});

test('clients reject missing secrets, unknown tools, and invalid argument JSON', async () => {
  const missingToken = await runClient(veraClient, 'vera_whoami', '{}');
  assert.equal(missingToken.code, 1);
  assert.match(missingToken.stderr, /VERA_TOKEN is unavailable/);

  const unknownTool = await runClient(neo4jClient, 'vera_whoami', '{}', {
    VERA_TOKEN: 'do-not-print',
  });
  assert.equal(unknownTool.code, 1);
  assert.match(unknownTool.stderr, /Usage:/);
  assert.doesNotMatch(unknownTool.stderr, /do-not-print/);

  const invalidJson = await runClient(neo4jClient, 'neo4j_read', '{oops', {
    VERA_TOKEN: 'do-not-print',
  });
  assert.equal(invalidJson.code, 1);
  assert.match(invalidJson.stderr, /must be valid JSON/);
  assert.doesNotMatch(invalidJson.stderr, /do-not-print/);
});

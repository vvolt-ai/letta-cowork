import test from 'node:test';
import assert from 'node:assert/strict';

import { listSharedLettaAgents } from '../dist-electron/services/agents/index.js';

test('lists every shared-agent page using the active Letta runtime credential', async () => {
  const previousBaseUrl = process.env.LETTA_BASE_URL;
  const previousApiKey = process.env.LETTA_API_KEY;
  const previousFetch = globalThis.fetch;
  const requests = [];

  process.env.LETTA_BASE_URL = 'https://api.letta.test/v1';
  process.env.LETTA_API_KEY = 'test-key';
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    requests.push({ url, init });
    const after = new URL(url).searchParams.get('after');
    return new Response(
      JSON.stringify(
        after
          ? {
              agents: [{ id: 'agent-shared-2', name: 'Shared two' }],
              nextCursor: null,
            }
          : {
              agents: [{ id: 'agent-shared-1', name: 'Shared one' }],
              nextCursor: 'next-page',
            },
      ),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };

  try {
    const agents = await listSharedLettaAgents('support');

    assert.deepEqual(
      agents.map(({ id, name }) => ({ id, name })),
      [
        { id: 'agent-shared-1', name: 'Shared one' },
        { id: 'agent-shared-2', name: 'Shared two' },
      ],
    );
    assert.equal(requests.length, 2);
    assert.match(requests[0].url, /\/v1\/shared-agents\?/);
    assert.equal(new URL(requests[0].url).searchParams.get('queryText'), 'support');
    assert.equal(new URL(requests[1].url).searchParams.get('after'), 'next-page');
    assert.match(
      new Headers(requests[0].init.headers).get('Authorization') ?? '',
      /^Bearer .+/,
    );
  } finally {
    globalThis.fetch = previousFetch;
    if (previousBaseUrl === undefined) delete process.env.LETTA_BASE_URL;
    else process.env.LETTA_BASE_URL = previousBaseUrl;
    if (previousApiKey === undefined) delete process.env.LETTA_API_KEY;
    else process.env.LETTA_API_KEY = previousApiKey;
  }
});

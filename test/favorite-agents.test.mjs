import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFavoriteAgents } from '../dist-electron/services/agents/favorite-agents.js';
function fixture(metadata = { id: 'cloud-user' }) {
  const calls = [];
  const client = {
    get: async (path) => {
      calls.push({ operation: 'GET', path });
      return metadata;
    },
    agents: {
      list: (query) => {
        calls.push({ operation: 'LIST', query });
        return (async function* () {
          yield { id: 'one', tags: ['favorite:user:cloud-user', 'git-memory-enabled'] };
          yield { id: 'other-user-only', tags: ['favorite:user:other'] };
          yield { id: 'legacy-global-only', tags: ['view:letta-chat'] };
          yield { id: 'one', tags: ['favorite:user:cloud-user'] };
        })();
      },
    },
  };
  return { client, calls };
}
test('uses authenticated upstream user metadata and tag-filtered pagination, not a Vera ID or global favourite tag', async () => {
  const f = fixture();
  const rows = await loadFavoriteAgents(f.client, ' selected ');
  assert.deepEqual(
    rows.map((a) => a.id),
    ['one'],
  );
  assert.deepEqual(f.calls, [
    { operation: 'GET', path: '/metadata/user' },
    {
      operation: 'LIST',
      query: {
        limit: 100,
        query_text: 'selected',
        tags: ['favorite:user:cloud-user'],
        match_all_tags: true,
        include: ['agent.tags'],
      },
    },
  ]);
});
for (const metadata of [{}, { id: '' }, { id: 42 }, null, { id: 'foreign/override' }])
  test(
    'fails closed when current user cannot be verified: ' + JSON.stringify(metadata),
    async () => {
      const f = fixture(metadata);
      await assert.rejects(loadFavoriteAgents(f.client), /verified current Letta user/);
      assert.equal(f.calls.length, 1);
    },
  );
test('metadata authorization errors never cause local favourites or another-account fallback', async () => {
  const f = fixture();
  f.client.get = async () => {
    throw Error('synthetic403');
  };
  await assert.rejects(loadFavoriteAgents(f.client), /synthetic403/);
  assert.equal(f.calls.length, 0);
});
test('rejects missing tag evidence rather than presenting unverified agents as favourites', async () => {
  const f = fixture();
  f.client.agents.list = () =>
    (async function* () {
      yield { id: 'unknown' };
    })();
  await assert.rejects(loadFavoriteAgents(f.client), /omitted verified agent tags/);
});

import type { Letta } from '@letta-ai/letta-client';

/** Letta Chat's current per-user favourite tag. Resolve the upstream account
 * identity, never a Vera UUID/email/model-supplied owner or another connection. */
export async function loadFavoriteAgents(client: Pick<Letta, 'get' | 'agents'>, queryText = '') {
  const metadata = await client.get<{ id?: unknown }>('/metadata/user', {});
  if (typeof metadata?.id !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(metadata.id))
    throw Error('Favourites require a verified current Letta user.');
  const tag = 'favorite:user:' + metadata.id;
  const agents = [];
  for await (const agent of client.agents.list({
    limit: 100,
    query_text: queryText.trim() || undefined,
    tags: [tag],
    match_all_tags: true,
    include: ['agent.tags'],
  })) {
    if (!Array.isArray(agent.tags)) throw Error('Favourites response omitted verified agent tags.');
    if (agent.tags.includes(tag)) agents.push(agent);
  }
  return [...new Map(agents.map((agent) => [agent.id, agent])).values()];
}

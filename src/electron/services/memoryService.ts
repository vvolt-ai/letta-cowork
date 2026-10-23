import { createScopedMemory } from './memfs/scoped-memory.js';
import { executeAgentMemory } from './memfs/agent-memory-access.js';
import { getLettaRuntimeConfig } from './letta-runtime/index.js';
import { getVeraCoworkApiClient } from '../api/index.js';

export interface MemoryFileResult {
  path: string;
  description?: string;
  preview: string;
  category: 'system' | 'reference' | 'other';
}

/** UI data uses the same scoped transport as execution, never the process-global
 * active-agent/default memory directory or a different connection fallback. */
export async function listAgentMemoryFiles(scope?: {
  agentId?: string;
  lettaConnectionId?: string;
}) {
  if (!scope?.agentId || typeof scope.agentId !== 'string')
    throw Error('Select an agent conversation before opening memory.');
  const config = getLettaRuntimeConfig(scope.lettaConnectionId);
  const memory = createScopedMemory({
    agentId: scope.agentId,
    connectionId: scope.lettaConnectionId,
    baseURL: config.baseURL,
    apiKey: config.apiKey,
    fetch: config.fetch,
    getApiKey:
      config.source === 'vera'
        ? () => getVeraCoworkApiClient().accessToken || undefined
        : undefined,
  });
  const snapshot = await memory.sync();
  const files: MemoryFileResult[] = [];
  const access = {
    snapshot: () => memory.snapshot(),
    refresh: () => memory.sync(),
    withRead: <T>(name: string, read: (state: typeof snapshot) => Promise<T>) =>
      memory.withRead(name, read),
  };
  let truncated = false;
  for (const repo of snapshot.repositories) {
    if (
      !repo.path ||
      !['ready', 'cached', 'blocked_dirty', 'diverged', 'conflict'].includes(repo.state)
    )
      continue;
    if (!repo.isPrimary && snapshot.sharedDiscovery !== 'verified') continue;
    const remaining = 100 - files.length;
    if (remaining <= 0) {
      truncated = true;
      break;
    }
    const list = (await executeAgentMemory(
      { action: 'list', repository: repo.name, limit: remaining },
      access,
      scope.agentId,
    )) as { files: Array<{ path: string; description?: string }>; truncated: boolean };
    truncated ||= list.truncated;
    for (const file of list.files) {
      const read = (await executeAgentMemory(
        { action: 'read', repository: repo.name, path: file.path },
        access,
        scope.agentId,
      )) as { content: string };
      const body = read.content.replace(/^---[\s\S]*?---\s*/m, '').trim();
      files.push({
        path: `${repo.name}/${file.path}`,
        description: file.description,
        preview: body.slice(0, 280),
        category: file.path.startsWith('system/')
          ? 'system'
          : file.path.startsWith('reference/')
            ? 'reference'
            : 'other',
      });
    }
  }
  return { files, memory: memory.status(), truncated };
}

// Compatibility low-level APIs remain for callers explicitly using those APIs;
// interactive memory view/execution above no longer relies on global credentials.
export {
  cloneMemoryRepo,
  pullMemory,
  ensureCheckout,
  ensureCheckoutForSession,
  commitAndPush,
  getMemoryGitStatus,
  listFiles as listMemoryFiles,
  readMemoryFile,
  writeMemoryFile,
  getMemoryRepoDir,
  isGitRepo,
  type MemoryFileMeta,
} from './memfs/memfsGit.js';

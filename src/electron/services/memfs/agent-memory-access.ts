import { promises as fs } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { SessionMemoryAccess } from './scoped-memory.js';
export const AGENT_MEMORY_PARAMETERS = {
  type: 'object',
  additionalProperties: false,
  required: ['action'],
  properties: {
    action: { type: 'string', enum: ['status', 'list', 'read', 'search', 'sync', 'push'] },
    repository: { type: 'string' },
    confirm: { type: 'boolean', description: 'Required true for explicit primary-memory push.' },
    expectedRevision: { type: 'string', pattern: '^[a-fA-F0-9]{40}([a-fA-F0-9]{24})?$', description: 'Exact committed HEAD returned by status; required for push.' },
    path: {
      type: 'string',
      description: 'Relative file/directory in your returned memory repository.',
    },
    query: { type: 'string', description: 'Literal search text.' },
    limit: { type: 'integer', minimum: 1, maximum: 100 },
  },
};
export const AGENT_MEMORY_DESCRIPTION =
  'Inspect your current agent memory checkout and attached shared repositories: status, bounded list/read/search, or safe download/sync. Runtime supplies identity and roots; no arbitrary agentId. Sync does not commit, push, reset, stash or enable agents. Explicit push publishes only the current agent primary memory using scoped credentials, requires confirm=true and expectedRevision from status, and never commits, writes shared repos or force-pushes. Read-only transports remain unsupported for push. Do not bypass governance/managed-memory ownership. A local file or verified remote Git ref is not proof current compiled memory was loaded.';
const MAX = 256 * 1024;
function rel(value: unknown) {
  if (value === undefined || value === '') return '';
  if (
    typeof value !== 'string' ||
    value.length > 512 ||
    isAbsolute(value) ||
    value.includes(':') ||
    value.includes(String.fromCharCode(0))
  )
    throw Error('INVALID_MEMORY_PATH');
  const parts = value.replaceAll('\\', '/').split('/');
  if (parts.some((p) => !p || p === '..' || p.startsWith('.'))) throw Error('INVALID_MEMORY_PATH');
  return parts.join(sep);
}
async function safe(root: string, path: string) {
  const base = resolve(root),
    real = await fs.realpath(base);
  if (relative(base, real) !== '') throw Error('UNSAFE_MEMORY_ROOT');
  let at = base;
  for (const part of path.split(sep).filter(Boolean)) {
    at = join(at, part);
    if ((await fs.lstat(at)).isSymbolicLink()) throw Error('UNSAFE_MEMORY_PATH');
  }
  const end = await fs.realpath(at),
    r = relative(real, end);
  if (r === '..' || r.startsWith('..' + sep) || isAbsolute(r)) throw Error('UNSAFE_MEMORY_PATH');
  return end;
}
async function text(root: string, path: string) {
  const file = await safe(root, path),
    s = await fs.stat(file);
  if (!s.isFile() || s.size > MAX) throw Error('MEMORY_FILE_LIMIT');
  const value = await fs.readFile(file, 'utf8');
  if (value.includes(String.fromCharCode(0))) throw Error('MEMORY_FILE_NOT_TEXT');
  return value;
}
async function listing(root: string, path: string, limit: number) {
  const files: Array<{ path: string; description?: string; }> = [];
  let visited = 0,
    truncated = false;
  async function walk(at: string, depth = 0) {
    if (visited++ >= 300 || files.length >= limit || depth > 20) {
      truncated = true;
      return;
    }
    const file = await safe(root, at),
      s = await fs.stat(file);
    if (s.isFile()) {
      if (!at.endsWith('.md')) return;
      if (s.size > MAX) {
        truncated = true;
        return;
      }
      const content = await text(root, at),
        desc = content.match(/^---\r?\n[\s\S]*?\bdescription:\s*([^\r\n]+)/)?.[1];
      files.push({
        path: at.split(sep).join('/'),
        ...(desc ? { description: desc.slice(0, 240) } : {}),
      });
      return;
    }
    if (!s.isDirectory()) return;
    for (const e of (await fs.readdir(file, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      if (e.name.startsWith('.') || e.name === 'node_modules' || e.isSymbolicLink()) continue;
      if (visited >= 300 || files.length >= limit) {
        truncated = true;
        break;
      }
      await walk(join(at, e.name), depth + 1);
    }
  }
  await walk(path);
  return { files, truncated };
}
export async function childMemoryContext(
  parent: import('../client-tools/types.js').ToolRunContext | undefined,
  agentId: string,
): Promise<import('../client-tools/types.js').ToolRunContext | undefined> {
  if (!parent) return undefined;
  const result = {
    ...parent,
    agentId,
    memoryDir: undefined as string | undefined,
    agentMemory: undefined as SessionMemoryAccess | undefined,
  };
  try {
    const access =
      parent.agentId === agentId ? parent.agentMemory : await parent.prepareAgentMemory?.(agentId);
    if (access) {
      const snapshot = await access.snapshot();
      if (snapshot.agentId !== agentId) throw Error('MEMORY_IDENTITY_MISMATCH');
      result.agentMemory = access;
      result.memoryDir = snapshot.memoryDir ?? undefined;
    } else if (parent.agentId === agentId) result.memoryDir = parent.memoryDir;
  } catch {
    /* No borrowed parent/global memory after failure. */
  }
  return result;
}
export async function executeAgentMemory(
  args: Record<string, unknown>,
  access: SessionMemoryAccess | undefined,
  agentId: string | undefined,
  signal?: AbortSignal,
): Promise<unknown> {
  if (
    Object.keys(args).some((k) => !['action', 'repository', 'path', 'query', 'limit', 'confirm', 'expectedRevision'].includes(k))
  )
    throw Error('MEMORY_SCOPE_ARGUMENT_NOT_ALLOWED');
  if (!access || !agentId) throw Error('AGENT_MEMORY_UNAVAILABLE');
  if (args.action === 'push') {
    if (args.confirm !== true) throw Error('MEMORY_PUSH_CONFIRMATION_REQUIRED');
    if (args.repository !== undefined && args.repository !== 'memory') throw Error('SHARED_MEMORY_PUSH_NOT_ALLOWED');
    if (args.path !== undefined || args.query !== undefined || args.limit !== undefined) throw Error('INVALID_MEMORY_PUSH_ARGUMENT');
    const before = await access.snapshot(); if (before.agentId !== agentId) throw Error('MEMORY_IDENTITY_MISMATCH');
    if (!access.push) throw Error('MEMORY_PUSH_UNAVAILABLE');
    return access.push({ confirm: true, expectedRevision: typeof args.expectedRevision === 'string' ? args.expectedRevision : '', signal });
  }
  if (args.confirm !== undefined || args.expectedRevision !== undefined) throw Error('INVALID_MEMORY_ACTION_ARGUMENT');
  if (!['status', 'list', 'read', 'search', 'sync'].includes(String(args.action)))
    throw Error('INVALID_MEMORY_ACTION');
  if (!['status', 'sync'].includes(String(args.action)) && access.withRead) {
    const name = args.repository ?? 'memory';
    if (typeof name !== 'string') throw Error('INVALID_MEMORY_REPOSITORY');
    return access.withRead(name, (s) =>
      executeAgentMemory(
        args,
        { snapshot: async () => s, refresh: () => access.refresh() },
        agentId,
      ),
    );
  }
  const s = await (args.action === 'sync' ? access.refresh() : access.snapshot());
  if (s.agentId !== agentId) throw Error('MEMORY_IDENTITY_MISMATCH');
  if (args.action === 'status' || args.action === 'sync') return s;
  const name = args.repository ?? 'memory';
  if (typeof name !== 'string') throw Error('INVALID_MEMORY_REPOSITORY');
  const repo = s.repositories.find((r) => r.name === name);
  if (
    !repo?.path ||
    !['ready', 'cached', 'blocked_dirty', 'diverged', 'conflict'].includes(repo.state)
  )
    throw Error('MEMORY_REPOSITORY_UNAVAILABLE');
  if (!repo.isPrimary && s.sharedDiscovery !== 'verified')
    throw Error('MEMORY_REPOSITORY_UNVERIFIED');
  const path = rel(args.path),
    limit = args.limit === undefined ? 20 : Number(args.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw Error('INVALID_MEMORY_LIMIT');
  const evidence = {
    repository: name,
    state: repo.state,
    revision: repo.revision,
    lastSuccessfulSyncAt: repo.lastSuccessfulSyncAt,
  };
  if (args.action === 'read') {
    if (!path) throw Error('MEMORY_FILE_REQUIRED');
    const body = await text(repo.path, path);
    return {
      ...evidence,
      path: path.split(sep).join('/'),
      content: body.slice(0, 24000),
      truncated: body.length > 24000,
    };
  }
  const files = await listing(repo.path, path, args.action === 'search' ? 100 : limit);
  if (args.action === 'list') return { ...evidence, ...files };
  if (typeof args.query !== 'string' || !args.query.trim() || args.query.length > 200)
    throw Error('INVALID_MEMORY_QUERY');
  const matches: Array<{ path: string; line: number; text: string; }> = [];
  let truncated = files.truncated;
  for (const f of files.files) {
    const lines = (await text(repo.path, f.path.split('/').join(sep))).split(/\r?\n/);
    for (let i = 0; i < lines.length; i++)
      if (lines[i].toLowerCase().includes(args.query.toLowerCase())) {
        if (matches.length >= limit) {
          truncated = true;
          break;
        }
        matches.push({ path: f.path, line: i + 1, text: lines[i].slice(0, 400) });
      }
    if (matches.length >= limit) {
      truncated = true;
      break;
    }
  }
  return { ...evidence, matches, truncated };
}

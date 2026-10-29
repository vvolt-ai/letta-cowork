import { promises as fs } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join, parse, resolve, sep } from 'node:path';
import { PRE_COMMIT_HOOK_SCRIPT } from './preCommitHook.js';
import { pushMemoryCommit, type MemoryPushRequest, type MemoryPushReceipt } from './memory-push.js';

export type MemorySyncState =
  | 'ready'
  | 'cached'
  | 'syncing'
  | 'blocked_dirty'
  | 'diverged'
  | 'conflict'
  | 'disabled'
  | 'unavailable'
  | 'error';
export interface MemoryRepositorySnapshot {
  name: string;
  isPrimary: boolean;
  path: string | null;
  readOnly: boolean;
  state: MemorySyncState;
  revision?: string;
  lastSuccessfulSyncAt?: string;
  errorCode?: string;
  lastPushedRevision?: string;
  lastSuccessfulPushAt?: string;
}
export interface AgentMemorySnapshot {
  agentId: string;
  state: MemorySyncState;
  memoryDir: string | null;
  repositories: MemoryRepositorySnapshot[];
  sharedDiscovery: 'verified' | 'unavailable' | 'error';
  sampledAt: string;
  errorCode?: string;
}
export interface SessionMemoryAccess {
  snapshot(): Promise<AgentMemorySnapshot>;
  refresh(): Promise<AgentMemorySnapshot>;
  push?(request: MemoryPushRequest): Promise<MemoryPushReceipt>;
  withRead?<T>(repository: string, read: (snapshot: AgentMemorySnapshot) => Promise<T>): Promise<T>;
}
export interface ScopedMemoryOptions {
  agentId: string;
  baseURL?: string;
  apiKey?: string;
  connectionId?: string;
  cacheRoot?: string;
  disabled?: boolean;
  expectedScopeId?: string;
  getApiKey?: () => string | undefined;
  fetch?: typeof fetch;
}
const exec = promisify(execFile);
const pendingCheckouts = new Map<string, Promise<unknown>>();
const agentOK = (value: string) =>
  /^agent-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const nameOK = (value: string) =>
  /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value) && !['.', '..'].includes(value.toLowerCase());
const readable = new Set<MemorySyncState>([
  'ready',
  'cached',
  'blocked_dirty',
  'diverged',
  'conflict',
]);
async function locked<T>(path: string, operation: () => Promise<T>): Promise<T> {
  const previous = pendingCheckouts.get(path) ?? Promise.resolve();
  const work = previous.catch(() => undefined).then(operation);
  pendingCheckouts.set(path, work);
  try {
    return await work;
  } finally {
    if (pendingCheckouts.get(path) === work) pendingCheckouts.delete(path);
  }
}
async function safeDirectory(path: string) {
  const absolute = resolve(path);
  let current = parse(absolute).root;
  for (const part of absolute.slice(current.length).split(sep).filter(Boolean)) {
    current = join(current, part);
    try {
      const s = await fs.lstat(current);
      if (s.isSymbolicLink() || !s.isDirectory()) throw Error('UNSAFE_MEMORY_PATH');
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
  }
}
async function json(
  url: string,
  headers: Record<string, string>,
  request: typeof fetch = fetch,
): Promise<any> {
  const response = await request(url, {
    headers,
    redirect: 'error',
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok)
    throw Error(
      [401, 403].includes(response.status) ? 'MEMORY_ACCESS_DENIED' : 'MEMORY_DESCRIPTOR_FAILED',
    );
  if (!response.body) throw Error('INVALID_MEMORY_DESCRIPTOR');
  const reader = response.body.getReader();
  const parts: Buffer[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > 1024 * 1024) throw Error('MEMORY_DESCRIPTOR_LIMIT');
      parts.push(Buffer.from(next.value));
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return JSON.parse(Buffer.concat(parts, size).toString('utf8'));
}
function gitEnvironment(headers: string[], authRemote?: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = Object.fromEntries(
    [
      'PATH',
      'Path',
      'HOME',
      'USERPROFILE',
      'SystemRoot',
      'WINDIR',
      'TMPDIR',
      'TMP',
      'TEMP',
      'LANG',
      'LC_ALL',
      'SSL_CERT_FILE',
      'SSL_CERT_DIR',
      'GIT_SSL_CAINFO',
    ]
      .filter((k) => process.env[k] !== undefined)
      .map((k) => [k, process.env[k]]),
  );
  Object.assign(env, {
    GIT_TERMINAL_PROMPT: '0',
    GCM_INTERACTIVE: 'never',
    GIT_ASKPASS: '',
    SSH_ASKPASS: '',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_NO_REPLACE_OBJECTS:'1',
    GIT_GRAFT_FILE:process.platform === 'win32'?'NUL':'/dev/null',
    GIT_NO_LAZY_FETCH:'1',
    GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null',
  });
  const config: Array<[string, string]> = [
    ['credential.helper', ''],
    ['core.askPass', ''],
    ['http.followRedirects', 'false'],
    ['http.extraHeader', ''],
    ['core.hooksPath', process.platform === 'win32' ? 'NUL' : '/dev/null'],
    ['fetch.recurseSubmodules', 'false'],
    ['push.recurseSubmodules', 'no'],
    ['push.followTags', 'false'],
    ...headers.map((h) => [authRemote ? `http.${authRemote}.extraHeader` : 'http.extraHeader', h] as [string, string]),
  ];
  env.GIT_CONFIG_COUNT = String(config.length);
  config.forEach(([key, value], i) => {
    env[`GIT_CONFIG_KEY_${i}`] = key;
    env[`GIT_CONFIG_VALUE_${i}`] = value;
  });
  return env;
}
export function createScopedMemory(options: ScopedMemoryOptions) {
  const o = Object.freeze({ ...options });
  let state: AgentMemorySnapshot = {
    agentId: o.agentId,
    state: o.disabled ? 'disabled' : 'unavailable',
    memoryDir: null,
    repositories: [],
    sharedDiscovery: 'unavailable',
    sampledAt: new Date().toISOString(),
    errorCode:o.disabled?undefined:'MEMORY_SYNC_REQUIRED',
  };
  let inFlight: Promise<AgentMemorySnapshot> | undefined;
  let boundScope: string | undefined = o.expectedScopeId;
  let boundConnection = o.connectionId;
  const activeRemotes = new Map<string, string>();
  let validatedKey: string | undefined;
  let generation = 0;
  const currentCredential = () => (o.getApiKey ? o.getApiKey() : o.apiKey);
  const status = () => {
    const key = currentCredential();
    if (!key && validatedKey !== undefined) {
      validatedKey = undefined;
      generation++;
    }
    if (state.repositories.length && (!key || key !== validatedKey))
      return {
        agentId: o.agentId,
        state: 'unavailable' as const,
        memoryDir: null,
        repositories: [],
        sharedDiscovery: 'unavailable' as const,
        sampledAt: new Date().toISOString(),
        errorCode: key ? 'MEMORY_AUTH_REVALIDATION_REQUIRED' : 'MEMORY_AUTH_REQUIRED',
      };
    return structuredClone(state);
  };
  async function validateCachedScope(): Promise<void> {
    if (o.disabled) return;
    const key = currentCredential();
    if (!key) {
      validatedKey = undefined;
      generation++;
      throw Error('MEMORY_AUTH_REQUIRED');
    }
    if (key === validatedKey) return;
    const base = new URL(o.baseURL!);
    if (!/\/letta\/runtime(?:\/v1)?\/?$/.test(base.pathname) || !boundScope)
      throw Error('MEMORY_AUTH_REVALIDATION_REQUIRED');
    const prefix = base.pathname.replace(/\/letta\/runtime(?:\/v1)?\/?$/, '');
    const authorizationGeneration = ++generation;
    const descriptor = await json(`${base.origin}${prefix}/letta/memfs/${o.agentId}/descriptor`, {
      Authorization: `Bearer ${key}`,
      ...(boundConnection ? { 'x-letta-connection-id': boundConnection } : {}),
    });
    if (currentCredential() !== key || generation !== authorizationGeneration)
      throw Error('MEMORY_AUTH_CHANGED');
    if (
      descriptor.agentId !== o.agentId ||
      descriptor.scopeId !== boundScope ||
      !Array.isArray(descriptor.repositories) ||
      descriptor.repositories.length > 100
    )
      throw Error('MEMORY_SCOPE_CHANGED');
    const names = new Set<string>();
    for (const repo of descriptor.repositories) {
      if (
        !nameOK(repo.name) ||
        typeof repo.isPrimary !== 'boolean' ||
        repo.isPrimary !== (repo.name === 'memory') ||
        repo.readOnly !== true ||
        repo.gitPath !== `/letta/memfs/${o.agentId}/repositories/${repo.name}.git` ||
        names.has(repo.name.toLowerCase())
      )
        throw Error('INVALID_MEMORY_DESCRIPTOR');
      names.add(repo.name.toLowerCase());
    }
    if (
      !names.has('memory') ||
      !['verified', 'error'].includes(descriptor.sharedDiscovery ?? 'verified')
    )
      throw Error('INVALID_MEMORY_DESCRIPTOR');
    const discovery = descriptor.sharedDiscovery ?? 'verified';
    state = {
      ...state,
      repositories: state.repositories.filter(
        (r) => names.has(r.name.toLowerCase()) && (r.isPrimary || discovery === 'verified'),
      ),
      sharedDiscovery: discovery,
    };
    validatedKey = key;
  }
  const git = async (path: string, args: string[], headers: string[], signal?: AbortSignal, authRemote?: string) => {
    try {
      return await exec('git', args, {
        cwd: path,
        env: gitEnvironment(headers, authRemote),
        signal,
        timeout: 60000,
        maxBuffer: 4 * 1024 * 1024,
      });
    } catch {
      throw Error('MEMORY_GIT_FAILED');
    }
  };
  async function syncRepository(
    repo: MemoryRepositorySnapshot,
    remote: string,
    headers: string[],
  ): Promise<MemoryRepositorySnapshot> {
    const path = repo.path!;
    const result = { ...repo };
    try {
      await safeDirectory(path);
      await safeDirectory(join(path, '.git'));
      let exists = true;
      try {
        await fs.access(join(path, '.git', 'HEAD'));
      } catch {
        exists = false;
      }
      if (!exists) {
        try {
          if ((await fs.readdir(path)).length)
            return { ...result, state: 'error', errorCode: 'EXISTING_UNMANAGED_CHECKOUT' };
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
        }
        await fs.mkdir(path, { recursive: true });
        await git(
          path,
          ['clone', ...(repo.isPrimary ? [] : ['--depth', '1']), '--', remote, '.'],
          headers,
        );
      }
      await safeDirectory(join(path, '.git'));
      if ((await git(path, ['remote', 'get-url', '--all', 'origin'], [])).stdout.trim() !== remote)
        return { ...result, state: 'error', errorCode: 'REMOTE_IDENTITY_MISMATCH' };
      const revision = (await git(path, ['rev-parse', '--verify', 'HEAD'], [])).stdout.trim();
      if (!/^[a-f0-9]{40,64}$/i.test(revision)) throw Error('INVALID_MEMORY_REVISION');
      result.revision = revision;
      await git(path, ['ls-remote', '--exit-code', 'origin', 'HEAD'], headers);
      const dirty = (
        await git(path, ['status', '--porcelain=v1', '--untracked-files=all', '-z'], [])
      ).stdout;
      if (dirty) {
        const conflict = dirty
          .split(String.fromCharCode(0))
          .some((row) => ['UU', 'AA', 'DD', 'AU', 'UA', 'DU', 'UD'].includes(row.slice(0, 2)));
        return {
          ...result,
          state: conflict ? 'conflict' : 'blocked_dirty',
          errorCode: 'LOCAL_CHANGES_PRESERVED',
        };
      }
      for (const marker of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'rebase-merge', 'rebase-apply']) {
        try {
          await fs.access(join(path, '.git', marker));
          return { ...result, state: 'conflict', errorCode: 'IN_PROGRESS_OPERATION' };
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
        }
      }
      await git(path, ['fetch', '--no-tags', 'origin'], headers);
      const ahead = (
        await git(path, ['rev-list', '--count', 'FETCH_HEAD..HEAD'], [])
      ).stdout.trim();
      if (!/^[0-9]+$/.test(ahead)) throw Error('INVALID_MEMORY_HISTORY');
      if (Number(ahead) > 0)
        return { ...result, state: 'diverged', errorCode: 'UNPUSHED_COMMITS_PRESERVED' };
      await git(path, ['merge', '--ff-only', 'FETCH_HEAD'], []);
      result.revision = (await git(path, ['rev-parse', '--verify', 'HEAD'], [])).stdout.trim();
      if (!/^[a-f0-9]{40,64}$/i.test(result.revision)) throw Error('INVALID_MEMORY_REVISION');
      // Install the standard hook only into an empty hook slot; preserve custom hooks.
      if (repo.isPrimary) {
        const hook = join(path, '.git', 'hooks', 'pre-commit');
        await safeDirectory(join(path, '.git', 'hooks'));
        await fs.mkdir(join(path, '.git', 'hooks'), { recursive: true });
        try {
          await fs.writeFile(hook, PRE_COMMIT_HOOK_SCRIPT, { flag: 'wx', mode: 0o755 });
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
        }
      }
      return {
        ...result,
        state: 'ready',
        lastSuccessfulSyncAt: new Date().toISOString(),
        errorCode: undefined,
      };
    } catch {
      return { ...result, state: 'error', errorCode: 'MEMORY_SYNC_FAILED' };
    }
  }
  async function inspectLocal(repo: MemoryRepositorySnapshot): Promise<MemoryRepositorySnapshot> {
    if (!repo.path || repo.state === 'error') return repo;
    try {
      await safeDirectory(repo.path);
      await safeDirectory(join(repo.path, '.git'));
      if (
        (await git(repo.path, ['remote', 'get-url', '--all', 'origin'], [])).stdout.trim() !==
        activeRemotes.get(repo.name)
      )
        throw Error('REMOTE_IDENTITY_MISMATCH');
      const revision = (await git(repo.path, ['rev-parse', '--verify', 'HEAD'], [])).stdout.trim();
      if (!/^[a-f0-9]{40,64}$/i.test(revision)) throw Error('INVALID_MEMORY_REVISION');
      const dirty = (
        await git(repo.path, ['status', '--porcelain=v1', '--untracked-files=all', '-z'], [])
      ).stdout;
      if (dirty) {
        const conflict = dirty
          .split(String.fromCharCode(0))
          .some((row) => ['UU', 'AA', 'DD', 'AU', 'UA', 'DU', 'UD'].includes(row.slice(0, 2)));
        return {
          ...repo,
          revision,
          state: conflict ? 'conflict' : 'blocked_dirty',
          errorCode: 'LOCAL_CHANGES_PRESERVED',
        };
      }
      for (const marker of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'rebase-merge', 'rebase-apply']) {
        try {
          await fs.access(join(repo.path, '.git', marker));
          return { ...repo, revision, state: 'conflict', errorCode: 'IN_PROGRESS_OPERATION' };
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
        }
      }
      try {
        const ahead = repo.lastPushedRevision === revision ? '0' : (
          await git(repo.path, ['rev-list', '--count', 'FETCH_HEAD..HEAD'], [])
        ).stdout.trim();
        if (!/^[0-9]+$/.test(ahead)) throw Error('INVALID_MEMORY_HISTORY');
        if (Number(ahead) > 0)
          return { ...repo, revision, state: 'diverged', errorCode: 'UNPUSHED_COMMITS_PRESERVED' };
      } catch {
        if (repo.state === 'diverged') return { ...repo, revision };
      }
      return { ...repo, revision, state: 'cached' };
    } catch {
      return { ...repo, state: 'error', errorCode: 'MEMORY_STATUS_FAILED' };
    }
  }
  async function prepare(operationGeneration: number): Promise<AgentMemorySnapshot> {
    if (o.disabled) {
      state = {
        ...state,
        state: 'disabled',
        memoryDir: null,
        repositories: [],
        sampledAt: new Date().toISOString(),
      };
      return status();
    }
    const currentKey = currentCredential();
    if (!agentOK(o.agentId) || !currentKey || !o.baseURL)
      throw Error('MEMORY_CONNECTION_UNAVAILABLE');
    const base = new URL(o.baseURL);
    if (
      base.username ||
      base.password ||
      base.search ||
      base.hash ||
      (base.protocol !== 'https:' &&
        !(base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)))
    )
      throw Error('UNSAFE_MEMORY_CONNECTION');
    const vera = /\/letta\/runtime(?:\/v1)?\/?$/.test(base.pathname);
    let discovery: AgentMemorySnapshot['sharedDiscovery'] = 'verified';
    let scope: string;
    let rows: Array<{ name: string; isPrimary: boolean; readOnly: boolean; remote: string; }>;
    let headers: string[];
    if (vera) {
      const prefix = base.pathname.replace(/\/letta\/runtime(?:\/v1)?\/?$/, '');
      const descriptor = await json(`${base.origin}${prefix}/letta/memfs/${o.agentId}/descriptor`, {
        Authorization: `Bearer ${currentKey}`,
        ...(boundConnection ? { 'x-letta-connection-id': boundConnection } : {}),
      });
      if (
        descriptor.agentId !== o.agentId ||
        !/^[a-f0-9]{64}$/i.test(descriptor.scopeId) ||
        !Array.isArray(descriptor.repositories)
      )
        throw Error('INVALID_MEMORY_DESCRIPTOR');
      discovery = descriptor.sharedDiscovery ?? 'verified';
      if (!['verified', 'error'].includes(discovery)) throw Error('INVALID_MEMORY_DESCRIPTOR');
      scope = descriptor.scopeId;
      if (descriptor.connectionId !== undefined) {
        if (
          typeof descriptor.connectionId !== 'string' ||
          !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
            descriptor.connectionId,
          )
        )
          throw Error('INVALID_MEMORY_DESCRIPTOR');
        boundConnection = descriptor.connectionId;
      }
      headers = [
        `Authorization: Bearer ${currentKey}`,
        `x-letta-memory-scope: ${scope}`,
        ...(boundConnection ? [`x-letta-connection-id: ${boundConnection}`] : []),
      ];
      rows = descriptor.repositories.map((r: any) => {
        if (
          typeof r.name !== 'string' ||
          !nameOK(r.name) ||
          typeof r.isPrimary !== 'boolean' ||
          r.readOnly !== true ||
          r.gitPath !== `/letta/memfs/${o.agentId}/repositories/${r.name}.git`
        )
          throw Error('INVALID_MEMORY_DESCRIPTOR');
        return {
          name: r.name,
          isPrimary: r.isPrimary,
          readOnly: true,
          remote: `${base.origin}${prefix}${r.gitPath}`,
        };
      });
    } else {
      if (!['', '/', '/v1', '/v1/'].includes(base.pathname))
        throw Error('UNSUPPORTED_MEMORY_CONNECTION');
      let catalog: { repositories: any[]; } = { repositories: [] };
      try {
        const found = await json(`${base.origin}/v1/agents/${o.agentId}/repositories`, {
          Authorization: `Bearer ${currentKey}`,
        });
        if (!Array.isArray(found.repositories)) throw Error('INVALID_MEMORY_DESCRIPTOR');
        catalog = found;
      } catch {
        discovery = 'error';
      }
      // A provider credential fallback is hashed, never returned or persisted as plaintext.
      scope = createHash('sha256')
        .update(
          JSON.stringify([
            base.origin,
            o.connectionId ?? createHash('sha256').update(currentKey).digest('hex'),
          ]),
        )
        .digest('hex');
      headers = [`Authorization: Basic ${Buffer.from(`letta:${currentKey}`).toString('base64')}`];
      rows = [
        {
          name: 'memory',
          isPrimary: true,
          readOnly: false,
          remote: `${base.origin}/v1/git/${o.agentId}/state.git`,
        },
        ...catalog.repositories
          .filter((r: any) => !r.is_primary && r.name !== 'memory')
          .map((r: any) => {
            if (typeof r.name !== 'string' || !nameOK(r.name) || typeof r.is_primary !== 'boolean')
              throw Error('INVALID_MEMORY_DESCRIPTOR');
            return {
              name: r.name,
              isPrimary: false,
              readOnly: !['write', 'admin', 'read_write'].includes(r.permissions),
              remote: `${base.origin}/v1/git/${o.agentId}/repositories/${encodeURIComponent(r.name)}.git`,
            };
          }),
      ];
    }
    if (discovery !== 'verified' && rows.some((r) => !r.isPrimary))
      throw Error('INVALID_MEMORY_DESCRIPTOR');
    if (
      rows.length < 1 ||
      rows.length > 100 ||
      rows.filter((r) => r.isPrimary && r.name === 'memory').length !== 1 ||
      rows.some((r) => r.isPrimary !== (r.name === 'memory')) ||
      new Set(rows.map((r) => r.name.toLowerCase())).size !== rows.length
    )
      throw Error('INVALID_MEMORY_DESCRIPTOR');
    if (currentCredential() !== currentKey || generation !== operationGeneration)
      throw Error('MEMORY_AUTH_CHANGED');
    if (boundScope !== undefined && boundScope !== scope) throw Error('MEMORY_SCOPE_CHANGED');
    boundScope = scope;
    activeRemotes.clear();
    for (const row of rows) activeRemotes.set(row.name, row.remote);
    const scopeKey = createHash('sha256')
      .update(JSON.stringify([base.origin, scope]))
      .digest('hex');
    const root = join(
      o.cacheRoot ?? join(homedir(), '.letta', 'agents'),
      'connections',
      scopeKey,
      o.agentId,
    );
    const repos: MemoryRepositorySnapshot[] = [];
    // Limit subprocess fan-out, with process-wide locks for concurrent sessions.
    for (let start = 0; start < rows.length; start += 4) {
      const batch = await Promise.all(
        rows.slice(start, start + 4).map((r) => {
          const repo: MemoryRepositorySnapshot = {
            name: r.name,
            isPrimary: r.isPrimary,
            readOnly: r.readOnly,
            path: join(root, r.name),
            state: 'unavailable',
          };
          return locked(repo.path!, () => {
            if (currentCredential() !== currentKey || generation !== operationGeneration)
              throw Error('MEMORY_AUTH_CHANGED');
            return syncRepository(repo, r.remote, headers);
          });
        }),
      );
      repos.push(...batch);
    }
    if (currentCredential() !== currentKey || generation !== operationGeneration)
      throw Error('MEMORY_AUTH_CHANGED');
    validatedKey = currentKey;
    const primary = repos.find((r) => r.isPrimary)!;
    const failure = repos.find((r) => r.state !== 'ready');
    state = {
      agentId: o.agentId,
      state: failure?.state ?? (discovery === 'verified' ? 'ready' : 'error'),
      memoryDir: primary.revision && readable.has(primary.state) ? primary.path : null,
      repositories: repos,
      sharedDiscovery: discovery,
      sampledAt: new Date().toISOString(),
    };
    return status();
  }
  return {
    async push(request: MemoryPushRequest): Promise<MemoryPushReceipt> {
      if (request.confirm !== true) throw Error('MEMORY_PUSH_CONFIRMATION_REQUIRED');
      if (typeof request.expectedRevision !== 'string' || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/i.test(request.expectedRevision)) throw Error('MEMORY_PUSH_EXPECTED_REVISION_REQUIRED');
      if (o.disabled) throw Error('AGENT_MEMORY_DISABLED');
      if (inFlight) throw Error('MEMORY_SYNC_IN_PROGRESS');
      if(!state.repositories.length)throw Error('MEMORY_SYNC_REQUIRED');
      await validateCachedScope();
      const initial = state.repositories.find(repo => repo.name === 'memory' && repo.isPrimary);
      if (!initial?.path || !['ready', 'cached', 'diverged', 'blocked_dirty', 'conflict'].includes(initial.state)) throw Error('MEMORY_REPOSITORY_UNAVAILABLE');
      if (initial.readOnly || /\/letta\/runtime(?:\/v1)?\/?$/.test(new URL(o.baseURL!).pathname)) throw Error('MEMORY_PUSH_TRANSPORT_READ_ONLY');
      return locked(initial.path, async () => {
        await validateCachedScope();
        const credential = currentCredential(), operationGeneration = generation;
        const primary = state.repositories.find(repo => repo.name === 'memory' && repo.isPrimary);
        const remote = activeRemotes.get('memory');
        const guard = () => {
          if (request.signal?.aborted) throw Error('MEMORY_PUSH_CANCELLED');
          if (!credential || credential !== currentCredential() || credential !== validatedKey || generation !== operationGeneration) throw Error('MEMORY_PUSH_AUTH_CHANGED');
          const current = state.repositories.find(repo => repo.name === 'memory' && repo.isPrimary);
          if (!current?.path || current.path !== initial.path || current.readOnly || activeRemotes.get('memory') !== remote) throw Error('MEMORY_SCOPE_CHANGED');
        };
        guard(); if (!primary?.path || !remote) throw Error('MEMORY_REPOSITORY_UNAVAILABLE');
        await safeDirectory(primary.path); await safeDirectory(join(primary.path, '.git'));
        for (const marker of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'rebase-merge', 'rebase-apply']) {
          try { await fs.access(join(primary.path, '.git', marker)); throw Error('IN_PROGRESS_OPERATION'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
        }
        const headers = [`Authorization: Basic ${Buffer.from(`letta:${credential}`).toString('base64')}`];
        const result = await pushMemoryCommit({ agentId: o.agentId, path: primary.path, remote, expectedRevision: request.expectedRevision, guard, git: (args, auth) => git(primary.path!, args, auth ? headers : [], request.signal, remote) });
        if (result.verified) {
          let observed: MemoryRepositorySnapshot;
          try { guard(); observed = await inspectLocal(primary); guard(); } catch { return { ...result, state: 'unverified', verified: false, errorCode: 'MEMORY_PUSH_OUTCOME_UNVERIFIED' }; }
          const sameCleanHead = observed.revision === result.revision && ['cached', 'ready', 'diverged'].includes(observed.state);
          const published = { ...observed, ...(sameCleanHead ? { state: 'cached' as const, errorCode: undefined } : {}), lastPushedRevision: result.revision, lastSuccessfulPushAt: new Date().toISOString() };
          const repositories = state.repositories.map(repo => repo.name === 'memory' ? published : repo);
          const bad = repositories.find(repo => !['ready', 'cached'].includes(repo.state));
          state = { ...state, state: bad?.state ?? (state.sharedDiscovery === 'verified' ? 'cached' : 'error'), repositories, sampledAt: new Date().toISOString() };
        }
        return result;
      });
    },
    sync(): Promise<AgentMemorySnapshot> {
      if (inFlight) return inFlight;
      const operationGeneration = ++generation;
      state = { ...state, state: 'syncing', sampledAt: new Date().toISOString() };
      const work = prepare(operationGeneration)
        .catch((error) => {
          if (generation !== operationGeneration) return status();
          generation++;
          validatedKey = undefined;
          const message = error instanceof Error ? error.message : '';
          state = {
            agentId: o.agentId,
            state: 'error',
            memoryDir: null,
            repositories: [],
            sharedDiscovery: 'error',
            sampledAt: new Date().toISOString(),
            errorCode: /^[A-Z_]+$/.test(message) ? message : 'MEMORY_SYNC_FAILED',
          };
          return status();
        })
        .finally(() => {
          if (inFlight === work) inFlight = undefined;
        });
      inFlight = work;
      return work;
    },
    status,
    scopeId: () => boundScope,
    async snapshot(): Promise<AgentMemorySnapshot> {
      if (!state.repositories.length) return status();
      await validateCachedScope();
      if (inFlight) return { ...status(), state: 'syncing' };
      const inspectedGeneration = generation;
      const repos = await Promise.all(
        state.repositories.map((repo) => locked(repo.path!, () => inspectLocal(repo))),
      );
      if (generation !== inspectedGeneration) return status();
      const primary = repos.find((r) => r.isPrimary);
      const bad = repos.find((r) => !['ready', 'cached'].includes(r.state));
      state = {
        ...state,
        repositories: repos,
        state: inFlight
          ? 'syncing'
          : (bad?.state ?? (state.sharedDiscovery === 'verified' ? 'cached' : 'error')),
        memoryDir: primary?.revision && readable.has(primary.state) ? primary.path : null,
        sampledAt: new Date().toISOString(),
      };
      return status();
    },
    async withRead<T>(
      repository: string,
      read: (snapshot: AgentMemorySnapshot) => Promise<T>,
    ): Promise<T> {
      if(o.disabled)throw Error('AGENT_MEMORY_DISABLED');
      if(!state.repositories.length)throw Error('MEMORY_SYNC_REQUIRED');
      await validateCachedScope();
      const credential = currentCredential();
      const readGeneration = generation;
      if (!credential || credential !== validatedKey) throw Error('MEMORY_AUTH_CHANGED');
      const repo = state.repositories.find((r) => r.name === repository);
      if (!repo?.path || (!repo.isPrimary && state.sharedDiscovery !== 'verified'))
        throw Error('MEMORY_REPOSITORY_UNAVAILABLE');
      return locked(repo.path, async () => {
        if (
          currentCredential() !== credential ||
          validatedKey !== credential ||
          generation !== readGeneration
        )
          throw Error('MEMORY_AUTH_CHANGED');
        const current = state.repositories.find((r) => r.name === repository);
        if (!current?.path || current.path !== repo.path)
          throw Error('MEMORY_REPOSITORY_UNAVAILABLE');
        const inspected = await inspectLocal(current);
        const snapshot = status();
        snapshot.repositories = snapshot.repositories.map((r) =>
          r.name === repository ? inspected : r,
        );
        const value = await read(snapshot);
        if (currentCredential() !== credential) {
          validatedKey = undefined;
          generation++;
          throw Error('MEMORY_AUTH_CHANGED');
        }
        if (generation !== readGeneration) throw Error('MEMORY_STATE_CHANGED');
        return value;
      });
    },
    env(): Readonly<Record<string, string>> {
      const active = status();
      return active.memoryDir
        ? {
          MEMORY_DIR: active.memoryDir,
          LETTA_MEMORY_DIR: active.memoryDir,
          AGENT_ID: o.agentId,
          LETTA_AGENT_ID: o.agentId,
        }
        : { AGENT_ID: o.agentId, LETTA_AGENT_ID: o.agentId };
    },
    notice(): string {
      const s = status();
      return `<agent_memory>\nAgent: ${s.agentId}; state=${s.state}; shared discovery=${s.sharedDiscovery}\nMEMORY_DIR: ${s.memoryDir ?? 'unavailable'}\n${s.repositories
        .slice(0, 20)
        .map(
          (r) =>
            `${r.name}: ${r.state}; ${r.path ?? 'unavailable'}; revision=${r.revision ?? 'unverified'}; ${r.readOnly ? 'read-only transport' : 'own memory'}`,
        )
        .join(
          '\n',
        )}\nAutomatic local Git refresh is off on normal chat turns. Use AgentMemory sync explicitly to prepare/refresh local files; existing files are preserved and server-side prompt memory is separate. Use AgentMemory status/list/read/search/sync. To publish already committed own-primary memory on a supported writable transport, use action=push with confirm=true and exact expectedRevision from status; no credentials in shell commands. Shared repositories cannot be pushed through this tool; read-only Vera transport stays read-only. File tools need literal absolute paths. Cached/dirty/error states are not current. A local pull does not prove compiled blocks were reloaded. No automatic commit, push, reset or tag changes.\n</agent_memory>`;
    },
  };
}

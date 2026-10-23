import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createServer, type ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import { promises as fs, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Socket } from 'node:net';

const require = createRequire(import.meta.url);
export interface NativeProviderConfig {
  baseURL: string;
  apiKey: string;
  defaultHeaders?: Record<string, string>;
  fetch?: typeof fetch;
}
export interface DesktopNativeOptions {
  agentId: string;
  conversationId: string;
  cwd: string;
  provider: NativeProviderConfig;
  assertCurrent(): void;
  authorizeCancellation?: (agentId: string, runIds: readonly string[]) => boolean;
  signal: AbortSignal;
  executablePath?: string;
  cliPath?: string;
  profileRoot?: string;
}
export interface DesktopNativeBinding {
  url: string;
  authToken: string;
  secretValues?: readonly string[];
  close(): Promise<void>;
}
function listen(server: ReturnType<typeof createServer>): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve((server.address() as { port: number }).port));
  });
}
export function resolveNativeCli(path = require.resolve('@letta-ai/letta-code')): string {
  const unpacked = path.replace(/app\.asar([/\\])/, 'app.asar.unpacked$1');
  return unpacked !== path && existsSync(unpacked) ? unpacked : path;
}
export function desktopNativeEnvironment(
  home: string,
  providerURL: string,
  token: string,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of [
    'PATH',
    'Path',
    'SystemRoot',
    'WINDIR',
    'TMPDIR',
    'TMP',
    'TEMP',
    'LANG',
    'LC_ALL',
    'SSL_CERT_FILE',
    'SSL_CERT_DIR',
    'NODE_EXTRA_CA_CERTS',
  ]) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return {
    ...env,
    HOME: home,
    USERPROFILE: home,
    ELECTRON_RUN_AS_NODE: '1',
    LETTA_BASE_URL: providerURL,
    LETTA_MEMFS_BASE_URL: providerURL,
    LETTA_API_KEY: token,
  };
}
export function processGroupHasLiveMembers(output: string, group: number): boolean {
  const rows = output.trim().split(/\r?\n/).filter(Boolean);
  if (!rows.length) throw Error('SDK_NATIVE_GROUP_INSPECTION_EMPTY');
  let live = false;
  for (const row of rows) {
    const match = /^\s*\d+\s+(\d+)\s+(\S+)\s*$/.exec(row);
    if (!match) throw Error('SDK_NATIVE_GROUP_INSPECTION_INVALID');
    if (Number(match[1]) === group && !match[2].startsWith('Z')) live = true;
  }
  return live;
}
type NativeGroupState = 'alive' | 'gone' | 'unverified';
function groupState(pid: number): NativeGroupState {
  try {
    process.kill(-pid, 0);
    return 'alive';
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return 'gone';
    if ((error as NodeJS.ErrnoException).code === 'EPERM') {
      const result = spawnSync('/bin/ps', ['-axo', 'pid=,pgid=,stat='], {
        encoding: 'utf8',
        timeout: 1000,
        maxBuffer: 2 * 1024 * 1024,
      });
      if (!result.error && result.status === 0 && !processGroupHasLiveMembers(result.stdout, pid))
        return 'gone';
      return 'unverified';
    }
    throw Error('SDK_NATIVE_GROUP_PROBE_FAILED: ' + (error as NodeJS.ErrnoException).code);
  }
}
/** Observe teardown after a delivered signal. A denied probe is neither stop
 * proof nor permission to escalate; wait boundedly for independent evidence. */
export async function waitForNativeGroup(
  probe: () => NativeGroupState,
  timeout: number,
): Promise<NativeGroupState> {
  const deadline = Date.now() + timeout;
  for (;;) {
    const state = probe();
    if (state === 'gone' || Date.now() >= deadline) return state;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
async function terminate(child: ChildProcess, exited: Promise<void>): Promise<void> {
  if (!child.pid) {
    await exited;
    return;
  }
  const pid = child.pid;
  if (process.platform === 'win32') {
    await new Promise<void>((resolve, reject) => {
      const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
      killer.once('error', reject);
      killer.once('exit', (code) =>
        code === 0 ? resolve() : reject(Error('SDK_NATIVE_TREE_CLEANUP_UNVERIFIED')),
      );
    });
    await exited;
    return;
  }
  const signal = (name: NodeJS.Signals) => {
    try {
      process.kill(-pid, name);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH')
        throw Error('SDK_NATIVE_GROUP_SIGNAL_FAILED: ' + (error as NodeJS.ErrnoException).code);
    }
  };
  signal('SIGTERM');
  let state = await waitForNativeGroup(() => groupState(pid), 1500);
  if (state === 'unverified') throw Error('SDK_NATIVE_TREE_CLEANUP_UNVERIFIED');
  if (state === 'alive') {
    signal('SIGKILL');
    state = await waitForNativeGroup(() => groupState(pid), 1500);
  }
  if (state !== 'gone') throw Error('SDK_NATIVE_TREE_CLEANUP_UNVERIFIED');
  await exited;
}
/** Main-owned fixed-origin relay keeps provider keys/token rotation out of the
 * native child and renderer. No request changes identity or selects a backend. */
export async function startDesktopAppServer(
  options: DesktopNativeOptions,
): Promise<DesktopNativeBinding> {
  options.assertCurrent();
  options.signal.throwIfAborted();
  const base = new URL(options.provider.baseURL);
  if (
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    !['https:', 'http:'].includes(base.protocol)
  )
    throw Error('SDK_PROVIDER_SCOPE_INVALID');
  base.pathname = base.pathname.replace(/\/$/, '').replace(/\/v1$/, '') + '/v1/';
  const root = options.profileRoot ?? tmpdir();
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  const home = await fs.mkdtemp(join(root, 'cowork-sdk-'));
  await fs.chmod(home, 0o700);
  const relayToken = randomBytes(32).toString('hex');
  const authToken = randomBytes(32).toString('hex');
  const sockets = new Set<Socket>();
  const upstreams = new Set<AbortController>();
  let child: ChildProcess | undefined;
  let exited: Promise<void> = Promise.resolve();
  let stopping: Promise<void> | undefined;
  let closed = false;
  const relay = createServer(async (req, res: ServerResponse) => {
    const ctrl = new AbortController();
    upstreams.add(ctrl);
    res.once('close', () => {
      if (!res.writableEnded) ctrl.abort();
    });
    try {
      if (closed || req.headers.authorization !== `Bearer ${relayToken}`) {
        res.writeHead(403).end();
        return;
      }
      options.assertCurrent();
      const raw = req.url ?? '/';
      const path = raw.split('?')[0];
      const decoded = decodeURIComponent(path);
      if (
        !path.startsWith('/') ||
        path.startsWith('//') ||
        decoded.includes('..') ||
        decoded.includes('\\') ||
        /%2e|%2f|%5c/i.test(decoded)
      )
        throw Error('SDK_RELAY_PATH_INVALID');
      const relative = raw.replace(/^\/v1(?:\/|(?=\?))/, '').replace(/^\//, '');
      const target = new URL(relative, base);
      if (target.origin !== base.origin || !target.pathname.startsWith(base.pathname))
        throw Error('SDK_RELAY_TARGET_INVALID');
      let size = 0;
      const chunks: Buffer[] = [];
      for await (const data of req) {
        size += data.length;
        if (size > 32 * 1024 * 1024) throw Error('SDK_RELAY_REQUEST_TOO_LARGE');
        chunks.push(Buffer.from(data));
      }
      if (req.method === 'POST' && /\/messages$/.test(target.pathname) && options.signal.aborted)
        throw Error('SDK_NEW_MODEL_INPUT_AFTER_STOP_DENIED');
      if (/\/cancel$/.test(target.pathname)) {
        const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
        const agentMatch = /\/agents\/([^/]+)\/messages\/cancel$/.exec(target.pathname);
        const runMatch = /\/runs\/([^/]+)\/cancel$/.exec(target.pathname);
        const ids = runMatch ? [runMatch[1]] : body.run_ids;
        if (
          (!agentMatch && !runMatch) ||
          !Array.isArray(ids) ||
          !ids.length ||
          ids.some((id) => typeof id !== 'string') ||
          (!runMatch && Object.keys(body).some((key) => key !== 'run_ids')) ||
          !options.authorizeCancellation?.(agentMatch?.[1] ?? options.agentId, ids)
        )
          throw Error('SDK_UNOWNED_CANCELLATION_DENIED');
      }
      const headers = new Headers(options.provider.defaultHeaders);
      headers.set('Authorization', `Bearer ${options.provider.apiKey}`);
      for (const key of [
        'accept',
        'content-type',
        'x-letta-response-state',
        'x-letta-request-id',
      ]) {
        const value = req.headers[key];
        if (typeof value === 'string') headers.set(key, value);
      }
      options.assertCurrent();
      const response = await (options.provider.fetch ?? fetch)(target, {
        method: req.method,
        headers,
        body: size ? Buffer.concat(chunks) : undefined,
        signal: ctrl.signal,
        redirect: 'manual',
      });
      options.assertCurrent();
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel();
        throw Error('SDK_RELAY_REDIRECT_DENIED');
      }
      const out: Record<string, string> = {};
      for (const key of ['content-type', 'cache-control']) {
        const value = response.headers.get(key);
        if (value) out[key] = value;
      }
      res.writeHead(response.status, out);
      if (response.body) {
        const reader = response.body.getReader();
        try {
          for (;;) {
            const item = await reader.read();
            if (item.done) break;
            options.assertCurrent();
            if (!res.write(item.value))
              await new Promise<void>((resolve, reject) => {
                res.once('drain', resolve);
                res.once('close', () => reject(Error('SDK_RELAY_READER_CLOSED')));
              });
          }
        } finally {
          await reader.cancel().catch(() => undefined);
        }
      }
      res.end();
    } catch {
      ctrl.abort();
      if (!res.headersSent)
        res
          .writeHead(502, { 'content-type': 'application/json' })
          .end(JSON.stringify({ error: 'Scoped SDK provider relay failed.' }));
      else res.destroy();
    } finally {
      upstreams.delete(ctrl);
    }
  });
  relay.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  const close = (): Promise<void> => {
    if (stopping) return stopping;
    closed = true;
    stopping = (async () => {
      options.signal.removeEventListener('abort', abortStartup);
      try {
        if (child) await terminate(child, exited);
      } finally {
        for (const ctrl of upstreams) ctrl.abort();
        for (const socket of sockets) socket.destroy();
        await new Promise<void>((resolve) => relay.close(() => resolve()));
      }
      // Own fresh scratch only; never an existing user checkout/profile.
      await fs.rm(home, { recursive: true, force: true });
    })();
    void stopping.catch(() => undefined);
    return stopping;
  };
  const abortStartup = () => {
    void close().catch(() => undefined);
  };
  options.signal.addEventListener('abort', abortStartup, { once: true });
  try {
    const port = await listen(relay);
    options.signal.throwIfAborted();
    options.assertCurrent();
    await fs.mkdir(join(home, '.letta'), { mode: 0o700 });
    const settings = {
      createDefaultAgents: false,
      reflectionTrigger: 'off',
      agents: [{ agentId: options.agentId, baseUrl: `127.0.0.1:${port}`, memfs: false }],
    };
    await fs.writeFile(join(home, '.letta', 'settings.json'), JSON.stringify(settings), {
      mode: 0o600,
      flag: 'wx',
    });
    options.signal.throwIfAborted();
    if (closed) throw Error('SDK_NATIVE_STARTUP_CANCELLED');
    options.assertCurrent();
    child = spawn(
      options.executablePath ?? process.execPath,
      [
        resolveNativeCli(options.cliPath),
        '--backend',
        'api',
        'server',
        '--listen',
        'ws://127.0.0.1:0',
        '--ws-auth',
        'capability-token',
        '--ws-token-sha256',
        createHash('sha256').update(authToken).digest('hex'),
      ],
      {
        cwd: home,
        env: desktopNativeEnvironment(home, `http://127.0.0.1:${port}`, relayToken),
        detached: process.platform !== 'win32',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    const ownedChild = child;
    exited = new Promise<void>((resolve) => {
      ownedChild.once('exit', () => resolve());
      ownedChild.once('error', () => resolve());
    });
    const url = await new Promise<string>((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(Error('SDK_NATIVE_STARTUP_TIMEOUT')), 30000);
      const finish = (value?: string) => {
        clearTimeout(timer);
        if (value) resolve(value);
        else reject(Error('SDK_NATIVE_STARTUP_FAILED'));
      };
      ownedChild.once('exit', () => finish());
      ownedChild.once('error', () => finish());
      ownedChild.stdout?.on('data', (data) => {
        output = (output + String(data)).slice(-16384);
        const match = /(?:^|\n)Listening on\s+(ws:\/\/127\.0\.0\.1:\d+\S*)[ \t]*\n/.exec(output);
        if (match) finish(match[1]);
      });
      ownedChild.stderr?.on('data', () => undefined);
    });
    options.signal.throwIfAborted();
    options.assertCurrent();
    options.signal.removeEventListener('abort', abortStartup);
    return { url, authToken, secretValues: [relayToken, authToken], close };
  } catch (error) {
    await close();
    throw error;
  }
}

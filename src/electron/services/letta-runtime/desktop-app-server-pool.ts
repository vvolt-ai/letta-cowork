import { createHash } from 'node:crypto';
import { startDesktopAppServer, type DesktopNativeOptions, type DesktopNativeBinding } from './native-host.js';
import type { DesktopNativeControls } from '../../libs/runner/sdk/native-controls.js';

export interface DesktopPoolRequest extends DesktopNativeOptions {
  scopeKey: string;
  controls: DesktopNativeControls;
}
interface RuntimeOwner { request: DesktopPoolRequest; released: boolean; }
interface Host {
  key: string;
  binding: DesktopNativeBinding;
  assertCurrent(): void;
  owners: Map<string, RuntimeOwner>;
  fences: Set<string>;
  retired: boolean;
}
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function providerBase(value: string) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || !['http:', 'https:'].includes(url.protocol)) throw Error('SDK_POOL_PROVIDER_INVALID');
  return url.href.replace(/\/+$/, '').replace(/\/v1$/, '');
}
export function desktopPoolBoundary(request: DesktopPoolRequest): string {
  if (!request.scopeKey || !request.agentId || !request.conversationId || !request.provider.apiKey) throw Error('SDK_POOL_SCOPE_REQUIRED');
  // Native MemFS is OFF: preserve per-agent cached settings policy, like Vera's
  // explicit memory-off boundary. CWD/tools/permissions remain per lease.
  return digest([request.scopeKey, providerBase(request.provider.baseURL), request.provider.source ?? 'local',
    request.provider.source === 'vera' ? null : digest(request.provider.apiKey),
    new Headers(request.provider.defaultHeaders).get('x-letta-connection-id'),
    request.agentId, 'desktop-stateless-memfs-off-v1', '0.34.39']);
}
function runtimeKey(request: DesktopPoolRequest) {
  return digest([providerBase(request.provider.baseURL), request.agentId, request.conversationId]);
}
async function waitForCaller<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  let abort!: () => void;
  const cancelled = new Promise<never>((_, reject) => {
    abort = () => reject(Error('SDK_POOL_ACQUIRE_CANCELLED'));
    signal.addEventListener('abort', abort, { once: true });
  });
  try { return await Promise.race([work, cancelled]); }
  finally { signal.removeEventListener('abort', abort); }
}

/** All authority comes from trusted main-process leases, never child headers.
 * Readback remains available after a lease's input is stopped, for stop proof. */
export function authorizeDesktopPoolRelay(
  owners: Iterable<RuntimeOwner>, method: string, path: string, bytes: Buffer,
): void {
  const active = [...owners].filter(owner => !owner.released);
  const body = () => bytes.length ? JSON.parse(bytes.toString('utf8')) as Record<string, any> : {};
  if (/\/cancel$/.test(path)) {
    const data = body();
    const agent = /\/agents\/([^/]+)\/messages\/cancel$/.exec(path);
    const run = /\/runs\/([^/]+)\/cancel$/.exec(path);
    const ids = run ? [run[1]] : data.run_ids;
    if ((!agent && !run) || method !== 'POST' || !Array.isArray(ids) || !ids.length || ids.some(id => typeof id !== 'string') || (!run && Object.keys(data).some(key => key !== 'run_ids'))) throw Error('SDK_UNOWNED_CANCELLATION_DENIED');
    const matches = active.filter(({request}) => {
      if (agent && request.agentId !== agent[1]) return false;
      return ids.every(id => request.controls.ownedRuns.has(id));
    });
    if (matches.length !== 1) throw Error('SDK_UNOWNED_CANCELLATION_DENIED');
    const request = matches[0].request;
    request.assertCurrent();
    request.controls.assertExclusive();
    if (!request.authorizeCancellation?.(request.agentId, ids)) throw Error('SDK_UNOWNED_CANCELLATION_DENIED');
    return;
  }
  if (method === 'POST' && /\/(?:messages(?:\/(?:stream|async))?|generate)$/.test(path)) {
    const data = body();
    const conversation = /\/conversations\/([^/]+)\/messages(?:\/(?:stream|async))?$/.exec(path)?.[1];
    const agent = /\/agents\/([^/]+)\/(?:messages(?:\/(?:stream|async))?|generate)$/.exec(path)?.[1];
    const cid = conversation ?? data.conversation_id;
    const matches = active.filter(({request}) => request.conversationId === cid && (!agent || request.agentId === agent));
    if ((!conversation && !agent) || matches.length !== 1) throw Error('SDK_POOL_MODEL_SCOPE_UNVERIFIED');
    const request = matches[0].request;
    request.assertCurrent();
    request.signal.throwIfAborted();
    request.controls.assertExclusive();
    if (!request.controls.hasSubmitted) throw Error('SDK_POOL_INPUT_NOT_REGISTERED');
    if (request.controls.hasTerminalProof()) throw Error('SDK_POOL_MODEL_AFTER_TERMINAL_DENIED');
  }
}

/** Persistent local hosts. A lease/client closing never terminates a neighbour. */
export class DesktopAppServerPool {
  private readonly hosts = new Map<string, Host>();
  private readonly starting = new Map<string, Promise<Host>>();
  private readonly startupControllers = new Map<string, AbortController>();
  private readonly terminating = new Map<string, Promise<void>>();
  private readonly runtimeOwners = new Map<string, RuntimeOwner>();
  private closed = false;
  private admission = true;
  constructor(
    private readonly launch: (options: DesktopNativeOptions) => Promise<DesktopNativeBinding> = startDesktopAppServer,
    private readonly maxHosts = 16,
  ) {
    if (!Number.isInteger(maxHosts) || maxHosts < 1 || maxHosts > 16) throw Error('SDK_POOL_CAPACITY_INVALID');
  }
  get hostCount() { return this.hosts.size; }
  get leaseCount() { return [...this.hosts.values()].reduce((n, host) => n + host.owners.size, 0); }
  suspendAdmission() { this.admission = false; }
  resumeAdmission() { if (!this.closed) this.admission = true; }
  async pruneIdleInvalid(): Promise<void> {
    for (const host of this.hosts.values()) {
      try { host.assertCurrent(); } catch { host.retired = true; }
      if (host.binding.isAlive?.() === false || (host.retired && !host.owners.size && !host.fences.size)) await this.retire(host);
    }
  }
  private retire(host: Host): Promise<void> {
    const previous = this.terminating.get(host.key);
    if (previous) return previous;
    host.retired = true;
    const work = Promise.resolve().then(() => host.binding.close()).then(() => {
      if (this.hosts.get(host.key) === host) this.hosts.delete(host.key);
      this.terminating.delete(host.key);
    });
    this.terminating.set(host.key, work);
    void work.catch(() => undefined); // Failed tree proof keeps boundary/capacity fenced.
    return work;
  }
  async acquire(request: DesktopPoolRequest): Promise<DesktopNativeBinding> {
    if (this.closed || !this.admission) throw Error('SDK_POOL_CLOSED');
    request.signal.throwIfAborted(); request.assertCurrent();
    const key = desktopPoolBoundary(request), runtime = runtimeKey(request);
    if (this.runtimeOwners.has(runtime)) throw Error('SDK_RUNTIME_ALREADY_OWNED');
    const owner: RuntimeOwner = {request, released: false};
    this.runtimeOwners.set(runtime, owner);
    try {
      // A failed retirement retains its host/capacity fence, not a global
      // outage for unrelated healthy boundaries.
      await this.pruneIdleInvalid().catch(() => undefined);
      if (this.terminating.has(key)) await waitForCaller(this.terminating.get(key)!, request.signal);
      request.signal.throwIfAborted(); request.assertCurrent();
      if (this.closed || !this.admission) throw Error('SDK_POOL_CLOSED');
      let host = this.hosts.get(key);
      const reused = Boolean(host);
      if (host?.retired || host?.binding.isAlive?.() === false) throw Error('SDK_POOL_BOUNDARY_UNAVAILABLE');
      if (!host) {
        let startup = this.starting.get(key);
        if (!startup) {
          if (new Set([...this.hosts.keys(), ...this.starting.keys(), ...this.terminating.keys()]).size >= this.maxHosts) throw Error('SDK_POOL_CAPACITY');
          const controller = new AbortController();
          this.startupControllers.set(key, controller);
          const owners = new Map<string, RuntimeOwner>();
          startup = Promise.resolve().then(() => this.launch({...request, signal: controller.signal,
            authorizeRelayRequest: (method, path, bytes) => authorizeDesktopPoolRelay(owners.values(), method, path, bytes),
          })).then(async binding => {
            const started: Host = {key, binding, owners, fences: new Set(), retired: false, assertCurrent: request.assertCurrent};
            this.hosts.set(key, started);
            if (this.closed) { await this.retire(started); throw Error('SDK_POOL_CLOSED'); }
            return started;
          }).finally(() => { this.starting.delete(key); this.startupControllers.delete(key); });
          this.starting.set(key, startup); void startup.catch(() => undefined);
        }
        host = await waitForCaller(startup, request.signal);
      }
      request.signal.throwIfAborted(); request.assertCurrent();
      if (this.closed || !this.admission || host.retired || host.binding.isAlive?.() === false || this.hosts.get(key) !== host) throw Error('SDK_POOL_CLOSED');
      host.owners.set(runtime, owner);
      const shared = host;
      let released = false;
      const release = async (verified: boolean, clientClosed = true) => {
        if (released) return;
        released = true; owner.released = true; shared.owners.delete(runtime);
        if (clientClosed && (verified || !request.controls.hasSubmitted)) {
          if (this.runtimeOwners.get(runtime) === owner) this.runtimeOwners.delete(runtime);
        } else shared.fences.add(runtime);
      };
      return {url: host.binding.url, authToken: host.binding.authToken, secretValues: host.binding.secretValues,
        poolReused: reused,
        isAlive: () => !shared.retired && shared.binding.isAlive?.() !== false,
        release, close: () => release(false)};
    } catch (error) {
      if (this.runtimeOwners.get(runtime) === owner) this.runtimeOwners.delete(runtime);
      throw error;
    }
  }
  async shutdown(): Promise<void> {
    if ([...this.hosts.values()].some(host => host.owners.size > 0)) throw Error('SDK_POOL_ACTIVE_LEASES');
    this.admission = false; this.closed = true;
    for (const controller of this.startupControllers.values()) controller.abort();
    await Promise.allSettled([...this.starting.values()]);
    const results = await Promise.allSettled([...this.hosts.values()].map(host => this.retire(host)));
    const failures = results.filter(result => result.status === 'rejected');
    if (failures.length) throw Error('SDK_POOL_SHUTDOWN_UNVERIFIED');
    // Runtime ownership/fences intentionally survive process exit. Never infer
    // stopped backend work merely because all local child processes are gone.
  }
}
export const desktopAppServers = new DesktopAppServerPool();

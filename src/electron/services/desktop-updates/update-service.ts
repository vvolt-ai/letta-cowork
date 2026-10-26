import { isIP } from 'node:net';
import type { DesktopUpdateState, DesktopReleaseSummary } from './update-types.js';
export interface UpdateScope {
  key: string;
  fetchLatest: () => Promise<unknown>;
}
export interface UpdateDependencies {
  version: string;
  platform: string;
  arch: string;
  isPackaged: boolean;
  scope: () => UpdateScope | null;
  now: () => number;
  readSnooze: () => unknown;
  writeSnooze: (value: { scope: string; version: string; until: number }) => void;
  openDownload: (url: string) => Promise<unknown>;
  emit: (state: DesktopUpdateState) => void;
}
export function stableParts(value: unknown): number[] | null {
  if (typeof value !== 'string' || !/^\d+\.\d+\.\d+$/.test(value)) return null;
  const tokens = value.split('.');
  if (tokens.some((v) => v.length > 1 && v.startsWith('0'))) return null;
  const parts = tokens.map(Number);
  return parts.every(Number.isSafeInteger) ? parts : null;
}
export function newerVersion(next: string, current: string): boolean {
  const a = stableParts(next),
    b = stableParts(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}
export function targetOsVersion(platform: string, kernel: string): string {
  const match = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(kernel);
  if (!match) return '0.0.0';
  if (platform === 'darwin') {
    const major = Number(match[1]);
    return major >= 20 ? `${major - 9}.0.0` : '10.0.0';
  }
  return `${match[1]}.${match[2] ?? 0}.${match[3] ?? 0}`;
}
export function safeDownloadUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048) throw Error('Invalid release download');
  const u = new URL(value);
  if (
    u.protocol !== 'https:' ||
    u.username ||
    u.password ||
    u.hash ||
    (u.port && u.port !== '443') ||
    isIP(u.hostname.replace(/^\[|\]$/g, '')) ||
    u.hostname === 'localhost' ||
    u.hostname.endsWith('.localhost') ||
    u.hostname.endsWith('.local')
  )
    throw Error('Invalid release download');
  return u.href;
}
export class DesktopUpdateService {
  private state: DesktopUpdateState;
  private key: string | null = null;
  private revision = 0;
  private flight?: { key: string; promise: Promise<DesktopUpdateState> };
  private operation = 0;
  private lastAttempt = -Infinity;
  private approved?: { key: string; url: string; version: string; sha256: string };
  constructor(private readonly deps: UpdateDependencies) {
    this.state = this.initial('idle');
  }
  private initial(status: DesktopUpdateState['status']): DesktopUpdateState {
    return {
      revision: this.revision,
      currentVersion: this.deps.version,
      platform: this.deps.platform,
      arch: this.deps.arch,
      status,
      showPrompt: false,
    };
  }
  private publish(next: DesktopUpdateState): DesktopUpdateState {
    this.state = { ...next, revision: ++this.revision };
    try {
      this.deps.emit(this.snapshot());
    } catch {
      /* A closing renderer is not an update failure. */
    }
    return this.snapshot();
  }
  private snapshot(): DesktopUpdateState {
    return { ...this.state, ...(this.state.release ? { release: { ...this.state.release } } : {}) };
  }
  private currentScope() {
    const scope = this.deps.scope();
    if ((scope?.key ?? null) !== this.key) {
      this.key = scope?.key ?? null;
      this.operation++;
      this.approved = undefined;
      this.lastAttempt = -Infinity;
      this.publish(this.initial(scope ? 'idle' : 'signed-out'));
    }
    return scope;
  }
  getState(): DesktopUpdateState {
    const scope = this.currentScope();
    if (!scope && this.state.status !== 'signed-out')
      return this.publish(this.initial('signed-out'));
    return this.snapshot();
  }
  async check(manual = false, force = false): Promise<DesktopUpdateState> {
    const scope = this.currentScope();
    if (!scope) return this.publish(this.initial('signed-out'));
    if (!manual && !this.deps.isPackaged) return this.getState();
    if (this.flight?.key === scope.key) return this.flight.promise;
    const wait = manual ? 30000 : 6 * 60 * 60 * 1000;
    if (!force && this.deps.now() - this.lastAttempt < wait) {
      if (manual && this.state.status === 'available')
        return this.publish({ ...this.state, showPrompt: true });
      return this.snapshot();
    }
    if (!stableParts(this.deps.version))
      return this.publish({
        ...this.initial('unsupported'),
        message: 'Only stable app versions support this update channel.',
      });
    const op = ++this.operation;
    this.lastAttempt = this.deps.now();
    this.approved = undefined;
    this.publish({ ...this.initial('checking'), lastCheckedAt: this.state.lastCheckedAt });
    const promise = (async () => {
      try {
        const raw = await scope.fetchLatest();
        if (this.currentScope()?.key !== scope.key || op !== this.operation) return this.getState();
        const parsed = this.parse(raw, scope.key, manual);
        return this.publish({ ...parsed, lastCheckedAt: this.deps.now() });
      } catch (error) {
        if (this.currentScope()?.key !== scope.key || op !== this.operation) return this.getState();
        this.approved = undefined;
        const status = (error as { status?: unknown })?.status;
        const message =
          status === 404
            ? 'This Vera server does not support update checks yet.'
            : status === 401 || status === 403
              ? 'Sign in to Vera to check for app updates.'
              : 'Could not check for updates. Check your Vera connection and try again.';
        return this.publish({
          ...this.initial(status === 404 ? 'unconfigured' : 'error'),
          lastCheckedAt: this.deps.now(),
          message,
        });
      }
    })();
    this.flight = { key: scope.key, promise };
    try {
      return await promise;
    } finally {
      if (this.flight?.promise === promise) this.flight = undefined;
    }
  }
  private parse(raw: unknown, key: string, manual: boolean): DesktopUpdateState {
    if (!raw || typeof raw !== 'object') throw Error('Invalid feed');
    const data = raw as Record<string, unknown>;
    if (
      data.schemaVersion !== 1 ||
      data.currentVersion !== this.deps.version ||
      !['available', 'up-to-date', 'unconfigured', 'unsupported'].includes(String(data.status))
    )
      throw Error('Invalid feed');
    if (data.status !== 'available') {
      const message =
        data.status === 'unconfigured'
          ? 'No app release feed has been configured on Vera.'
          : data.status === 'unsupported'
            ? 'No compatible update is published for this platform or OS.'
            : undefined;
      return {
        ...this.initial(data.status as DesktopUpdateState['status']),
        ...(message ? { message } : {}),
      };
    }
    const r = data.release as Record<string, unknown> | undefined;
    const format =
      this.deps.platform === 'darwin' ? 'dmg' : this.deps.platform === 'win32' ? 'exe' : 'tar.xz';
    if (
      !r ||
      !stableParts(r.version) ||
      !newerVersion(String(r.version), this.deps.version) ||
      r.platform !== this.deps.platform ||
      r.arch !== this.deps.arch ||
      r.format !== format ||
      typeof r.notes !== 'string' ||
      r.notes.length > 6000 ||
      typeof r.publishedAt !== 'string' ||
      !Number.isFinite(Date.parse(r.publishedAt)) ||
      Date.parse(r.publishedAt) > this.deps.now() ||
      typeof r.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(r.sha256) ||
      (r.minimumOsVersion !== undefined &&
        (typeof r.minimumOsVersion !== 'string' ||
          !/^\d{1,5}(?:\.\d{1,5}){0,2}$/.test(r.minimumOsVersion)))
    )
      throw Error('Invalid release');
    const url = safeDownloadUrl(r.downloadUrl);
    const release: DesktopReleaseSummary = {
      version: String(r.version),
      publishedAt: r.publishedAt,
      notes: r.notes,
      format,
      sha256: r.sha256,
      ...(r.minimumOsVersion ? { minimumOsVersion: String(r.minimumOsVersion) } : {}),
    };
    const snooze = this.deps.readSnooze() as {
      scope?: unknown;
      version?: unknown;
      until?: unknown;
    } | null;
    const hidden =
      !manual &&
      snooze?.scope === key &&
      snooze.version === release.version &&
      typeof snooze.until === 'number' &&
      Number.isFinite(snooze.until) &&
      snooze.until > this.deps.now() &&
      snooze.until <= this.deps.now() + 86400000;
    this.approved = { key, url, version: release.version, sha256: release.sha256 };
    return { ...this.initial('available'), release, showPrompt: !hidden };
  }
  dismiss(version: unknown): DesktopUpdateState {
    const scope = this.currentScope();
    if (scope && this.state.status === 'available' && version === this.state.release?.version) {
      this.deps.writeSnooze({
        scope: scope.key,
        version: String(version),
        until: this.deps.now() + 86400000,
      });
      return this.publish({ ...this.state, showPrompt: false });
    }
    return this.getState();
  }
  async download(version: unknown): Promise<{ opened: boolean }> {
    if (typeof version !== 'string' || !stableParts(version)) throw Error('Invalid update version');
    const key = this.currentScope()?.key;
    if (!key) throw Error('Sign in to Vera first.');
    const selected = this.approved;
    if (!selected || selected.key !== key || selected.version !== version)
      throw Error('Check for updates before downloading.');
    await this.check(true, true);
    const approved = this.approved;
    if (
      this.currentScope()?.key !== key ||
      this.state.status !== 'available' ||
      !approved ||
      approved.key !== key ||
      approved.version !== version ||
      approved.sha256 !== selected.sha256
    )
      throw Error('Update details changed. Check for updates again.');
    await this.deps.openDownload(safeDownloadUrl(approved.url));
    if (this.currentScope()?.key === key)
      this.publish({ ...this.state, showPrompt: false, downloadOpened: true });
    return { opened: true };
  }
}

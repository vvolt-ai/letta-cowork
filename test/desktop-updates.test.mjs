import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DesktopUpdateService,
  newerVersion,
  safeDownloadUrl,
  targetOsVersion,
} from '../dist-electron/services/desktop-updates/update-service.js';
import { fetchDesktopRelease } from '../dist-electron/services/desktop-updates/update-transport.js';
import { registerUpdateIpc } from '../dist-electron/services/desktop-updates/update-ipc.js';
test('update IPC accepts only the owned live main frame and cleans up handlers', () => {
  const callbacks = new Map(),
    frame = { url: 'file:///fixture' },
    contents = { mainFrame: frame },
    owner = { webContents: contents };
  let live = true,
    validated = 0,
    checks = 0;
  const off = registerUpdateIpc(
    owner,
    {
      getState: () => ({ status: 'idle' }),
      check: (manual) => {
        checks++;
        return manual;
      },
      dismiss: () => {},
      download: () => {},
    },
    { handle: (key, fn) => callbacks.set(key, fn), removeHandler: (key) => callbacks.delete(key) },
    (given) => {
      assert.equal(given, frame);
      validated++;
    },
    () => live,
  );
  const event = { sender: contents, senderFrame: frame };
  assert.equal(callbacks.get('desktop-updates:check')(event, false), false);
  assert.equal(checks, 1);
  assert.equal(validated, 1);
  for (const bad of [
    { sender: {}, senderFrame: frame },
    { sender: contents, senderFrame: {} },
    { sender: contents, senderFrame: null },
  ])
    assert.throws(() => callbacks.get('desktop-updates:check')(bad, true), /Untrusted/);
  assert.throws(
    () => callbacks.get('desktop-updates:check')(event, 'true'),
    /Invalid update check/,
  );
  live = false;
  assert.throws(() => callbacks.get('desktop-updates:get')(event), /Untrusted/);
  off();
  assert.equal(callbacks.size, 0);
});
const good = (version = '1.0.3') => ({
  schemaVersion: 1,
  currentVersion: '1.0.2',
  status: 'available',
  release: {
    version,
    publishedAt: '2020-01-01T00:00:00Z',
    notes: 'Plain text <script>not HTML</script>',
    platform: 'darwin',
    arch: 'arm64',
    format: 'dmg',
    sha256: 'a'.repeat(64),
    downloadUrl: 'https://downloads.example.test/app.dmg',
  },
});
function harness(overrides = {}) {
  let now = Date.parse('2026-10-26T00:00:00Z'),
    key = 'scope-a',
    snooze,
    data = good(),
    calls = 0;
  const opened = [],
    events = [];
  const deps = {
    version: '1.0.2',
    platform: 'darwin',
    arch: 'arm64',
    isPackaged: true,
    now: () => now,
    scope: () =>
      key
        ? {
            key,
            fetchLatest: async () => {
              calls++;
              return data;
            },
          }
        : null,
    readSnooze: () => snooze,
    writeSnooze: (v) => {
      snooze = v;
    },
    openDownload: async (url) => {
      opened.push(url);
    },
    emit: (state) => events.push(state),
    ...overrides,
  };
  const service = new DesktopUpdateService(deps);
  return {
    service,
    deps,
    opened,
    events,
    get calls() {
      return calls;
    },
    set key(v) {
      key = v;
    },
    set data(v) {
      data = v;
    },
    advance: (ms) => {
      now += ms;
    },
    get snooze() {
      return snooze;
    },
  };
}
test('stable version comparison and OS fallback do not confuse 1.10 with 1.9', () => {
  assert.equal(newerVersion('1.10.0', '1.9.9'), true);
  assert.equal(newerVersion('1.0.3-beta', '1.0.2'), false);
  assert.equal(newerVersion('1.0.2', '1.0.3'), false);
  assert.equal(targetOsVersion('darwin', '22.6.0'), '13.0.0');
});
test('available update notification contains only safe display metadata, not download URLs', async () => {
  const h = harness();
  const state = await h.service.check(false);
  assert.equal(state.status, 'available');
  assert.equal(state.showPrompt, true);
  assert.equal(state.release.version, '1.0.3');
  assert.ok(!JSON.stringify(h.events).includes('https://'));
});
test('Later persists a bounded per-scope/per-version 24-hour snooze; manual check can override it', async () => {
  const h = harness();
  await h.service.check();
  h.service.dismiss('1.0.3');
  assert.equal(h.service.getState().showPrompt, false);
  assert.equal(h.snooze.version, '1.0.3');
  h.advance(6 * 3600000);
  assert.equal((await h.service.check()).showPrompt, false);
  assert.equal((await h.service.check(true)).showPrompt, true);
});
test('newer versions are not hidden by an old version snooze', async () => {
  const h = harness();
  await h.service.check();
  h.service.dismiss('1.0.3');
  h.data = good('1.0.4');
  h.advance(6 * 3600000);
  assert.equal((await h.service.check()).showPrompt, true);
});
test('automatic checks are disabled in development, but manual checking works', async () => {
  const h = harness({ isPackaged: false });
  await h.service.check(false);
  assert.equal(h.calls, 0);
  await h.service.check(true);
  assert.equal(h.calls, 1);
});
test('signed out clients make no update request', async () => {
  const h = harness();
  h.key = null;
  assert.equal((await h.service.check(true)).status, 'signed-out');
  assert.equal(h.calls, 0);
});
test('manual requests are deduplicated and background checks are throttled', async () => {
  let resolve,
    calls = 0;
  const wait = new Promise((r) => (resolve = r));
  const h = harness({
    scope: () => ({
      key: 'x',
      fetchLatest: () => {
        calls++;
        return wait;
      },
    }),
  });
  const a = h.service.check(true),
    b = h.service.check(true);
  assert.equal(calls, 1);
  resolve(good());
  await Promise.all([a, b]);
  await h.service.check(false);
  assert.equal(calls, 1);
});
test('a late response cannot cross account or origin scope', async () => {
  let scope = 'a',
    resolveA;
  const wait = new Promise((r) => (resolveA = r));
  const h = harness({
    scope: () => ({
      key: scope,
      fetchLatest: () => (scope === 'a' ? wait : Promise.resolve(good('1.0.4'))),
    }),
  });
  const pending = h.service.check(true);
  scope = 'b';
  assert.equal((await h.service.check(true)).release.version, '1.0.4');
  resolveA(good());
  await pending;
  assert.equal(h.service.getState().release.version, '1.0.4');
});
test('logout clears previously approved download state', async () => {
  const h = harness();
  await h.service.check(true);
  h.key = null;
  assert.equal(h.service.getState().status, 'signed-out');
  await assert.rejects(h.service.download('1.0.3'), /Sign in/);
  assert.equal(h.opened.length, 0);
});
test('download requires explicit current version and revalidates the feed before opening the browser', async () => {
  const h = harness();
  await h.service.check(true);
  assert.equal(h.opened.length, 0);
  assert.deepEqual(await h.service.download('1.0.3'), { opened: true });
  assert.equal(h.calls, 2);
  assert.deepEqual(h.opened, ['https://downloads.example.test/app.dmg']);
  assert.equal(h.service.getState().downloadOpened, true);
});
test('a changed release cannot silently become a different download after a click', async () => {
  const h = harness();
  await h.service.check(true);
  h.data = good('1.0.4');
  await assert.rejects(h.service.download('1.0.3'), /details changed/);
  assert.equal(h.opened.length, 0);
});
test('an installer digest change requires renewed user approval', async () => {
  const h = harness();
  await h.service.check(true);
  const changed = good();
  changed.release.sha256 = 'b'.repeat(64);
  h.data = changed;
  await assert.rejects(h.service.download('1.0.3'), /details changed/);
  assert.equal(h.opened.length, 0);
});
test('a version guess cannot open a download without a prior approved result', async () => {
  const h = harness();
  await assert.rejects(h.service.download('1.0.3'), /Check for updates/);
  assert.equal(h.calls, 0);
  assert.equal(h.opened.length, 0);
});
test('renderer-supplied URLs are not accepted as download arguments', async () => {
  const h = harness();
  await assert.rejects(h.service.download('https://evil.test'), /Invalid update version/);
  assert.equal(h.calls, 0);
});
test('unconfigured and unavailable servers are not reported as up to date', async () => {
  const h = harness();
  h.data = { schemaVersion: 1, currentVersion: '1.0.2', status: 'unconfigured' };
  assert.equal((await h.service.check(true)).status, 'unconfigured');
  const other = harness({
    scope: () => ({
      key: 'x',
      fetchLatest: async () => {
        throw Object.assign(Error('private body not shown'), { status: 404 });
      },
    }),
  });
  const state = await other.service.check(true);
  assert.equal(state.status, 'unconfigured');
  assert.ok(!state.message.includes('private body'));
});
test('malformed, wrong-target and downgrade responses fail closed', async () => {
  for (const mutate of [
    (r) => (r.release.arch = 'x64'),
    (r) => (r.release.version = '1.0.1'),
    (r) => (r.release.sha256 = 'bad'),
    (r) => (r.currentVersion = '9.0.0'),
    (r) => (r.release.downloadUrl = 'file:///tmp/evil'),
  ]) {
    const h = harness(),
      data = good();
    mutate(data);
    h.data = data;
    assert.equal((await h.service.check(true)).status, 'error');
    assert.equal(h.opened.length, 0);
  }
});
test('unsafe URL schemes, credentials, local hosts and fragments are rejected', () => {
  for (const url of [
    'http://evil.test',
    'file:///tmp/test',
    'https://x:y@evil.test/a',
    'https://127.0.0.1/a',
    'https://localhost/a',
    'https://evil.test/#x',
  ])
    assert.throws(() => safeDownloadUrl(url));
});
test('transport preserves the selected Vera base path, sends auth only in headers and forbids redirects', async () => {
  let request;
  await fetchDesktopRelease(
    'https://vera.example.test/api',
    'fixture-token',
    { version: '1.0.2', platform: 'darwin', arch: 'arm64', osVersion: '13.6' },
    async (url, options) => {
      request = { url: new URL(url), options };
      return new Response(JSON.stringify(good()), {
        headers: { 'content-type': 'application/json' },
      });
    },
  );
  assert.equal(request.url.pathname, '/api/desktop-updates/latest');
  assert.equal(request.options.redirect, 'error');
  assert.equal(request.options.headers.Authorization, 'Bearer fixture-token');
  assert.ok(!request.url.href.includes('fixture-token'));
  assert.equal(request.url.searchParams.get('arch'), 'arm64');
});
test('transport rejects oversized metadata and insecure non-loopback API origins', async () => {
  const target = { version: '1.0.2', platform: 'darwin', arch: 'arm64', osVersion: '13' };
  await assert.rejects(
    fetchDesktopRelease('http://remote.example.test', 'fixture', target),
    /secure Vera/,
  );
  await assert.rejects(
    fetchDesktopRelease(
      'https://vera.example.test',
      'fixture',
      target,
      async () => new Response('x'.repeat(32769)),
    ),
    /too large/,
  );
});

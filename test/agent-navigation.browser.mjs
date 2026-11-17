import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
const { chromium } = await import(process.argv[2] || 'playwright');
const origin = 'http://127.0.0.1:5197';
const dev = spawn(
  'bun',
  ['run', 'dev:react', '--host', '127.0.0.1', '--port', '5197', '--strictPort'],
  { detached: true, stdio: ['ignore', 'pipe', 'pipe'] },
);
let output = '';
dev.stdout.on('data', (v) => (output += v));
dev.stderr.on('data', (v) => (output += v));
let browser;
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (dev.exitCode !== null) throw Error('Fixture server stopped: ' + output.slice(-1000));
    try {
      const r = await fetch(origin + '/test/agent-navigation.fixture.html');
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  assert(ready, 'Local fixture server did not start');
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
    outside = [],
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/*', (route) =>
    route.request().url().startsWith(origin)
      ? route.continue()
      : (outside.push(route.request().url()), route.abort()),
  );
  await page.goto(origin + '/test/agent-navigation.fixture.html');
  const choose = (name) => page.getByRole('button', { name: 'Select agent ' + name, exact: true }),
    chat = page.getByLabel('Chat draft', { exact: true });
  await choose('AndrOptimus Prime').waitFor();
  await page.getByRole('button', { name: /Load more conversations/ }).waitFor();
  await page.waitForFunction(() => document.querySelectorAll('.agentRailItem').length === 10);
  assert.equal(await page.locator('.agentRailItem').count(), 10);
  assert.equal(await page.locator('.agentChatList [role="button"]').count(), 10);
  await mkdir('test-results/agent-navigation', { recursive: true });
  await page.screenshot({ path: 'test-results/agent-navigation/default-ten.png', fullPage: true });
  await page.getByRole('button', { name: 'Load more agents', exact: true }).click();
  assert.equal(await page.locator('.agentRailItem').count(), 20);
  await page.getByRole('button', { name: 'Load more agents', exact: true }).click();
  assert.equal(await page.locator('.agentRailItem').count(), 25);
  assert.equal(await page.locator('.agentChatList [role="button"]').count(), 10);
  await page.getByRole('button', { name: /Load more conversations/ }).click();
  assert.equal(await page.locator('.agentChatList [role="button"]').count(), 20);
  let pages = 0;
  while (await page.getByRole('button', { name: /Load more conversations/ }).count()) {
    assert(++pages <= 12);
    await page.getByRole('button', { name: /Load more conversations/ }).click();
  }
  await page.getByText('Research conversation 119', { exact: true }).waitFor();
  assert.equal(await page.getByRole('combobox', { name: 'Agent list', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Memory', exact: true }).count(), 0);
  assert.equal(await page.locator('.agentListFilter').count(), 0);
  const actions = await page.locator('.agentActions button').allTextContents();
  assert.deepEqual(
    actions.map((s) => s.trim()),
    ['Schedules', 'Remote Access', 'Emails', 'New chat'],
  );
  await chat.fill('Draft on active research');
  await choose('Shelly').click();
  assert.equal(
    await page.locator('.agentRailItem').first().getAttribute('aria-label'),
    'Select agent Shelly',
  );
  assert.equal(await chat.inputValue(), '');
  await chat.fill('Shelly new-chat draft');
  await choose('AndrOptimus Prime').click();
  await chat.fill('Andr new-chat draft');
  await page.getByLabel('Search conversations', { exact: true }).fill('Active research');
  await page.getByRole('button', { name: /Active research/ }).click();
  assert.equal(await chat.inputValue(), 'Draft on active research');
  assert.equal(await page.evaluate(() => window.navigationFixture.snapshot().running), 'running');
  await choose('Shelly').click();
  assert.equal(await chat.inputValue(), 'Shelly new-chat draft');
  await page.getByRole('button', { name: 'New chat', exact: true }).click();
  assert.equal(await page.evaluate(() => window.navigationFixture.snapshot().modelCalls), 0);
  assert((await page.evaluate(() => window.navigationFixture.calls)).includes('new-chat:agent-b'));
  for (const view of ['Schedules', 'Remote Access', 'Emails']) {
    await page.getByRole('button', { name: view, exact: true }).click();
    await page.getByRole('heading', { name: view, exact: true }).waitFor();
  }
  await page.evaluate(() => window.navigationFixture.holdNextA());
  await choose('AndrOptimus Prime').click();
  await page.waitForTimeout(50);
  await choose('Shelly').click();
  await page.getByText('Shelly fixture chat', { exact: true }).waitFor();
  await page.evaluate(() => window.navigationFixture.releaseA());
  await page.waitForTimeout(50);
  assert.equal(await page.getByText('Research conversation 119', { exact: true }).count(), 0);
  await mkdir('test-results/agent-navigation', { recursive: true });
  await page.screenshot({ path: 'test-results/agent-navigation/wide.png', fullPage: true });
  await page.setViewportSize({ width: 900, height: 750 });
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
    false,
  );
  assert.equal(
    await page.locator('.agentRail').evaluate((el) => getComputedStyle(el).overflowX),
    'visible',
  );
  await page.screenshot({ path: 'test-results/agent-navigation/narrow.png', fullPage: true });
  await page.evaluate(() => window.navigationFixture.holdNextA());
  await choose('AndrOptimus Prime').click();
  await page.waitForTimeout(50);
  await page.getByRole('button', { name: 'Switch fixture workspace' }).click();
  await page.getByRole('button', { name: 'Select agent Other workspace agent' }).waitFor();
  await page.evaluate(() => window.navigationFixture.releaseA());
  await page.waitForTimeout(50);
  assert.equal(await choose('AndrOptimus Prime').count(), 0);
  assert.equal(await page.getByText('Research conversation 119', { exact: true }).count(), 0);
  assert.equal(await chat.inputValue(), '');
  const calls = await page.evaluate(() => window.navigationFixture.calls);
  assert.equal(
    calls.some((v) => v.startsWith('FORBIDDEN:')),
    false,
  );
  assert.equal(calls.some((value) => value.startsWith('list-favourites:') || value.startsWith('memory:')), false);
  assert.equal(calls.includes('ipc:session.stop'), false);
  assert.equal(calls.includes('ipc:session.start'), false);
  assert.deepEqual(outside, []);
  assert.deepEqual(errors, []);
  await page.goto(origin + '/test/agent-navigation.fixture.html?failure');
  await page.getByRole('alert').filter({ hasText: 'Could not load agents.' }).waitFor();
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await choose('Shelly').waitFor();
  await page.goto(origin + '/test/agent-navigation.fixture.html?chat-failure');
  await page.getByRole('alert').filter({ hasText: 'Could not load all conversations.' }).waitFor();
  assert.equal(await page.getByRole('button', { name: /Active research/ }).count(), 1);
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await page.getByLabel('Search conversations', { exact: true }).fill('Research conversation 119');
  await page.getByText('Research conversation 119', { exact: true }).waitFor();
  assert.equal(await page.locator('.agentChatList [role="button"]').count(), 1);
  await page.goto(origin + '/test/agent-navigation.fixture.html?empty');
  await page.getByText('No agents available.', { exact: true }).waitFor();
  assert.equal(await page.locator('.agentRailItem').count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Memory', exact: true }).count(), 0);
  assert.equal(
    await page.evaluate(() =>
      window.navigationFixture.calls.some(
        (v) => v.startsWith('FORBIDDEN:') || v === 'ipc:session.start',
      ),
    ),
    false,
  );
  assert.deepEqual(outside, []);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      fixtureOnly: true,
      verified: [
        'flat action order',
        'agents without sessions',
        'all remote chats past four/100',
        'selected-agent new chat without premature creation',
        'conversation/new-agent draft restoration',
        'background work retained',
        'Memory shortcut and agent-list dropdown absent',
        'recent-only navigation without favourites queries',
        'direct feature actions',
        'stale agent response discarded',
        'workspace isolation',
        'narrow layout',
        'no live external/model calls',
      ],
    }),
  );
} finally {
  await browser?.close();
  try {
    process.kill(-dev.pid, 'SIGTERM');
  } catch {}
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createScopedMemory } from '../dist-electron/services/memfs/scoped-memory.js';
import {
  executeAgentMemory,
  childMemoryContext,
} from '../dist-electron/services/memfs/agent-memory-access.js';
import { getShellEnv } from '../dist-electron/services/client-tools/runners/shell/shellEnv.js';
import { runWithRuntimeContext } from '../dist-electron/services/client-tools/runners/_shared/runtime-context.js';
import { registerClientTool, runClientTool } from '../dist-electron/services/client-tools/index.js';
import { skillTool } from '../dist-electron/services/client-tools/runners/skill.js';
const AGENT = 'agent-11111111-1111-1111-1111-111111111111';
const base = 'http://127.0.0.1:43119/letta/runtime';
async function fixture() {
  const root = await fs.mkdtemp(join(await fs.realpath(tmpdir()), 'scoped-memory-'));
  const bin = join(root, 'bin');
  await fs.mkdir(bin);
  const log = join(root, 'git-calls.jsonl');
  const shim = `#!${process.execPath}\nconst fs=require('node:fs'),p=require('node:path');const a=process.argv.slice(2),cwd=process.cwd(),state=p.join(cwd,'.git','fixture.json');fs.appendFileSync(${JSON.stringify(log)},JSON.stringify({cwd,args:a,authInEnvironment:Object.values(process.env).some(v=>String(v).startsWith('Authorization: '))})+'\\n');let s;try{s=JSON.parse(fs.readFileSync(state,'utf8'))}catch{}if(a[0]==='clone'){fs.mkdirSync(p.join(cwd,'.git'),{recursive:true});fs.writeFileSync(p.join(cwd,'.git','HEAD'),'fixture');fs.mkdirSync(p.join(cwd,'reference'),{recursive:true});fs.writeFileSync(p.join(cwd,'reference','fixture.md'),'---\\ndescription: Fixture memory\\n---\\nUse current documents.');s={remote:a.at(-2),revision:'a'.repeat(40),ahead:'0'};}let out='';if(!s)process.exit(2);if(a[0]==='remote')out=s.remote;if(['ls-remote','fetch'].includes(a[0])&&fs.existsSync(p.join(cwd,'.git','deny-remote')))process.exit(1);if(a[0]==='status'&&fs.existsSync(p.join(cwd,'.git','slow-status')))Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,400);if(a[0]==='status')out=fs.existsSync(p.join(cwd,'.git','dirty'))?' M reference/fixture.md'+String.fromCharCode(0):'';if(a[0]==='rev-parse')out=s.revision;if(a[0]==='rev-list')out=s.ahead;if(a[0]==='merge')s.revision='b'.repeat(40);fs.writeFileSync(state,JSON.stringify(s));process.stdout.write(out);`;
  await fs.writeFile(join(bin, 'git'), shim, { mode: 0o755 });
  const original = {
    PATH: process.env.PATH,
    LOG: process.env.FAKE_MEMORY_GIT_LOG,
    fetch: globalThis.fetch,
  };
  process.env.PATH = bin + ':' + process.env.PATH;
  process.env.FAKE_MEMORY_GIT_LOG = log;
  let scope = 'a'.repeat(64),
    shared = true,
    discovery = 'verified';
  let calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({
      url: String(url),
      authorization: new Headers(init?.headers).get('authorization'),
    });
    return Response.json({
      agentId: AGENT,
      scopeId: scope,
      sharedDiscovery: discovery,
      repositories: [
        {
          name: 'memory',
          isPrimary: true,
          readOnly: true,
          gitPath: `/letta/memfs/${AGENT}/repositories/memory.git`,
        },
        ...(shared
          ? [
              {
                name: 'core_system',
                isPrimary: false,
                readOnly: true,
                gitPath: `/letta/memfs/${AGENT}/repositories/core_system.git`,
              },
            ]
          : []),
      ],
    });
  };
  return {
    root,
    log,
    calls,
    setScope: (v) => (scope = v),
    partial() {
      shared = false;
      discovery = 'error';
    },
    create(extra = {}) {
      return createScopedMemory({
        agentId: AGENT,
        baseURL: base,
        apiKey: 'fixture-token-A',
        cacheRoot: join(root, 'cache'),
        ...extra,
      });
    },
    async cleanup() {
      globalThis.fetch = original.fetch;
      process.env.PATH = original.PATH;
      if (original.LOG === undefined) delete process.env.FAKE_MEMORY_GIT_LOG;
      else process.env.FAKE_MEMORY_GIT_LOG = original.LOG;
      await fs.rm(root, { recursive: true, force: true });
    },
  };
}

test(
  'scoped desktop memory offline integration',
  { skip: process.platform === 'win32' },
  async (t) => {
    await t.test(
      'primary/shared checkout, true scope, readonly transport and no credentials in argv/files',
      async () => {
        const f = await fixture();
        try {
          const memory = f.create();
          const s = await memory.sync();
          assert.equal(s.state, 'ready');
          assert.deepEqual(
            s.repositories.map((r) => r.name),
            ['memory', 'core_system'],
          );
          assert(s.repositories.every((r) => r.readOnly));
          assert.equal(f.calls[0].url, `http://127.0.0.1:43119/letta/memfs/${AGENT}/descriptor`);
          assert.equal(f.calls[0].authorization, 'Bearer fixture-token-A');
          const lines = (await fs.readFile(f.log, 'utf8')).trim().split('\n').map(JSON.parse);
          assert(lines.some((l) => l.authInEnvironment));
          assert(!JSON.stringify(lines).includes('fixture-token-A'));
          assert(
            !JSON.stringify(await fs.readdir(join(s.memoryDir, '.git'))).includes(
              'credential-helper',
            ),
          );
          const access = {
            snapshot: () => memory.snapshot(),
            refresh: () => memory.sync(),
            withRead: (name, read) => memory.withRead(name, read),
          };
          const result = await executeAgentMemory(
            { action: 'read', repository: 'core_system', path: 'reference/fixture.md' },
            access,
            AGENT,
          );
          assert(result.content.includes('Use current documents'));
          assert.equal((await memory.snapshot()).state, 'cached');
        } finally {
          await f.cleanup();
        }
      },
    );
    await t.test(
      'dirty work, local commits and wrong remotes are never silently reset/overwritten',
      async () => {
        const f = await fixture();
        try {
          const m = f.create(),
            s = await m.sync();
          await fs.writeFile(join(s.memoryDir, '.git', 'dirty'), 'yes');
          await fs.writeFile(join(s.memoryDir, 'reference', 'fixture.md'), 'LOCAL EDIT');
          assert.equal((await m.sync()).state, 'blocked_dirty');
          assert.equal(
            await fs.readFile(join(s.memoryDir, 'reference', 'fixture.md'), 'utf8'),
            'LOCAL EDIT',
          );
          await fs.unlink(join(s.memoryDir, '.git', 'dirty'));
          const stateFile = join(s.memoryDir, '.git', 'fixture.json'),
            g = JSON.parse(await fs.readFile(stateFile, 'utf8'));
          g.ahead = '1';
          await fs.writeFile(stateFile, JSON.stringify(g));
          assert.equal((await m.sync()).state, 'diverged');
          assert.equal((await m.snapshot()).state, 'diverged');
          await fs.writeFile(join(s.memoryDir, '.git', 'MERGE_HEAD'), 'fixture');
          assert.equal((await m.snapshot()).state, 'conflict');
          await fs.unlink(join(s.memoryDir, '.git', 'MERGE_HEAD'));
          g.remote = 'https://untrusted.invalid/other.git';
          await fs.writeFile(stateFile, JSON.stringify(g));
          assert.equal((await m.sync()).memoryDir, null);
          const commands = await fs.readFile(f.log, 'utf8');
          assert(!commands.includes('"reset"'));
          assert(!commands.includes('"rebase"'));
          assert(!commands.includes('"push"'));
        } finally {
          await f.cleanup();
        }
      },
    );
    await t.test(
      'JWT rotation keeps stable cache; owner/account switch fails instead of borrowing old memory',
      async () => {
        const f = await fixture();
        try {
          let token = 'fixture-token-A';
          const m = f.create({ getApiKey: () => token });
          const a = await m.sync();
          token = 'fixture-token-A-refreshed';
          const b = await m.sync();
          assert.equal(b.memoryDir, a.memoryDir);
          assert.equal(f.calls.at(-1).authorization, token.replace(/^/, 'Bearer '));
          f.setScope('b'.repeat(64));
          assert.equal((await m.sync()).errorCode, 'MEMORY_SCOPE_CHANGED');
          assert.equal(m.env().MEMORY_DIR, undefined);
          assert.equal(
            await fs.readFile(join(a.memoryDir, 'reference', 'fixture.md'), 'utf8'),
            '---\ndescription: Fixture memory\n---\nUse current documents.',
          );
          const other = f.create({ apiKey: 'fixture-token-B' });
          assert.notEqual((await other.sync()).memoryDir, a.memoryDir);
        } finally {
          await f.cleanup();
        }
      },
    );
    await t.test(
      'cached access is invalidated on logout/account switch, but a same-owner JWT refresh revalidates',
      async () => {
        const f = await fixture();
        try {
          let token = 'fixture-token-A';
          const m = f.create({ getApiKey: () => token });
          const first = await m.sync();
          token = 'fixture-token-A-refreshed';
          assert.equal(m.env().MEMORY_DIR, undefined);
          assert.equal((await m.snapshot()).memoryDir, first.memoryDir);
          token = undefined;
          assert.equal(m.status().memoryDir, null);
          assert.equal(m.env().MEMORY_DIR, undefined);
          await assert.rejects(m.snapshot(), /MEMORY_AUTH_REQUIRED/);
          await assert.rejects(m.withRead('memory', async (s) => s));
          token = 'fixture-token-B';
          f.setScope('b'.repeat(64));
          assert.equal(m.status().memoryDir, null);
          await assert.rejects(m.snapshot(), /MEMORY_SCOPE_CHANGED/);
          assert.equal(m.notice().includes(first.memoryDir), false);
        } finally {
          await f.cleanup();
        }
      },
    );
    await t.test(
      'account switch during descriptor cannot use new credentials under the old cache scope',
      async () => {
        const f = await fixture();
        try {
          let token = 'fixture-token-A';
          let release;
          const gate = new Promise((r) => (release = r));
          const fetchDescriptor = globalThis.fetch;
          globalThis.fetch = async (...args) => {
            const response = await fetchDescriptor(...args);
            await gate;
            return response;
          };
          const m = f.create({ getApiKey: () => token });
          const work = m.sync();
          await new Promise((r) => setImmediate(r));
          token = 'fixture-token-B';
          release();
          const result = await work;
          assert.equal(result.errorCode, 'MEMORY_AUTH_CHANGED');
          assert.equal(result.memoryDir, null);
          await assert.rejects(fs.access(f.log));
        } finally {
          await f.cleanup();
        }
      },
    );
    await t.test(
      'stale local inspection cannot resurrect cached roots after a newer denial',
      async () => {
        const f = await fixture();
        try {
          const m = f.create();
          const first = await m.sync();
          await fs.writeFile(join(first.memoryDir, '.git', 'slow-status'), 'yes');
          const stale = m.snapshot();
          await new Promise((r) => setTimeout(r, 20));
          globalThis.fetch = async () => new Response('denied', { status: 403 });
          await m.sync();
          await stale;
          assert.equal(m.status().memoryDir, null);
          await assert.rejects(m.withRead('memory', async (s) => s));
          assert.equal(m.env().MEMORY_DIR, undefined);
        } finally {
          await f.cleanup();
        }
      },
    );
    await t.test('known remote denial cannot be reclassified as readable dirty cache', async () => {
      const f = await fixture();
      try {
        const m = f.create();
        const first = await m.sync();
        await fs.writeFile(join(first.memoryDir, '.git', 'dirty'), 'yes');
        await fs.writeFile(join(first.memoryDir, '.git', 'deny-remote'), 'yes');
        const failed = await m.sync();
        assert.equal(failed.repositories[0].state, 'error');
        assert.equal((await m.snapshot()).memoryDir, null);
        await assert.rejects(
          executeAgentMemory(
            { action: 'read', path: 'reference/fixture.md' },
            {
              snapshot: () => m.snapshot(),
              refresh: () => m.sync(),
              withRead: (n, r) => m.withRead(n, r),
            },
            AGENT,
          ),
        );
      } finally {
        await f.cleanup();
      }
    });
    await t.test(
      'partial discovery keeps verified primary, disabled memory makes no calls, unknown args/path denied',
      async () => {
        const f = await fixture();
        try {
          f.partial();
          const m = f.create();
          const s = await m.sync();
          assert.equal(s.sharedDiscovery, 'error');
          assert.equal((await m.snapshot()).state, 'error');
          assert(s.memoryDir);
          assert.equal(s.repositories.length, 1);
          const n = f.calls.length;
          const disabled = f.create({ disabled: true });
          assert.equal((await disabled.sync()).state, 'disabled');
          assert.equal(f.calls.length, n);
          const access = { snapshot: () => m.snapshot(), refresh: () => m.sync() };
          await assert.rejects(
            executeAgentMemory({ action: 'read', path: '../outside' }, access, AGENT),
          );
          await assert.rejects(
            executeAgentMemory({ action: 'status', agentId: 'other' }, access, AGENT),
          );
        } finally {
          await f.cleanup();
        }
      },
    );
    await t.test('tool dispatch resolves a child root after a delayed cold checkout', async () => {
      let ready = false;
      registerClientTool({
        name: 'FixtureDelayedMemoryEnv',
        description: 'offline test',
        parameters: {},
        run: async (_args, ctx) => ({
          output: JSON.stringify({ ctxPath: ctx.memoryDir, shellPath: getShellEnv().MEMORY_DIR }),
          isError: false,
        }),
      });
      const ctx = {
        signal: new AbortController().signal,
        agentId: AGENT,
        agentMemory: {
          snapshot: async () => ({
            agentId: AGENT,
            state: ready ? 'cached' : 'syncing',
            memoryDir: ready ? '/fixture/child/memory' : null,
            repositories: [],
            sharedDiscovery: 'verified',
            sampledAt: new Date().toISOString(),
          }),
        },
      };
      assert.deepEqual(
        JSON.parse((await runClientTool('FixtureDelayedMemoryEnv', {}, ctx)).output),
        {},
      );
      ready = true;
      assert.deepEqual(
        JSON.parse((await runClientTool('FixtureDelayedMemoryEnv', {}, ctx)).output),
        { ctxPath: '/fixture/child/memory', shellPath: '/fixture/child/memory' },
      );
    });
    await t.test(
      'memory skills, shell env and child identity use the active runtime scope, not globals',
      async () => {
        const f = await fixture();
        const old = process.env.MEMORY_DIR;
        try {
          const m = f.create();
          const s = await m.sync();
          const access = { snapshot: () => m.snapshot(), refresh: () => m.sync() };
          const skill = join(s.repositories[1].path, 'skills', 'FixtureScopedMemory');
          await fs.mkdir(skill, { recursive: true });
          await fs.writeFile(
            join(skill, 'SKILL.md'),
            '---\nname: FixtureScopedMemory\ndescription: Scoped test\n---\nUse this actual shared mount.',
          );
          const ctx = {
            agentId: AGENT,
            memoryDir: s.memoryDir,
            agentMemory: access,
            signal: new AbortController().signal,
            workingDirectory: f.root,
          };
          const loaded = await skillTool.run({ name: 'FixtureScopedMemory' }, ctx);
          assert.equal(loaded.isError, false);
          assert(loaded.output.includes('shared-memory:core_system'));
          process.env.MEMORY_DIR = '/wrong-global';
          await runWithRuntimeContext(ctx, async () => {
            assert.equal(getShellEnv().MEMORY_DIR, s.memoryDir);
          });
          await runWithRuntimeContext({ agentId: 'other' }, async () => {
            assert.equal(getShellEnv().MEMORY_DIR, undefined);
          });
          const child = await childMemoryContext(ctx, 'other');
          assert.equal(child.memoryDir, undefined);
          assert.equal(child.agentMemory, undefined);
        } finally {
          if (old === undefined) delete process.env.MEMORY_DIR;
          else process.env.MEMORY_DIR = old;
          await f.cleanup();
        }
      },
    );
  },
);

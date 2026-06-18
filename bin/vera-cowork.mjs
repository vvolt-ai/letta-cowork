#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const DEFAULT_SERVER_URL = 'https://vera-cowork-server.ngrok.app';
const TOKEN_PATH = join(homedir(), '.letta-cowork', '.cowork-token');
const VERA_AUTH_PATH = join(homedir(), '.letta-cowork', 'vera-auth.json');
const GLOBAL_LOGIN_SCRIPT = join(homedir(), '.letta', 'skills', 'vera-server-login', 'scripts', 'vera-login.mjs');
const REPO_LOGIN_SCRIPT = resolve(import.meta.dirname, '..', 'skills', 'vera-server-login', 'scripts', 'vera-login.mjs');
const EXTENSION_SOURCE = resolve(import.meta.dirname, '..', 'extensions', 'vera-cowork-api.mjs');
const EXTENSION_TARGET = join(homedir(), '.letta', 'extensions', 'vera-cowork-api.mjs');

function normalizeBaseUrl(value) {
  return String(value || DEFAULT_SERVER_URL).trim().replace(/\/+$/, '');
}

function readText(path) {
  try {
    if (!existsSync(path)) return null;
    return readFileSync(path, 'utf8').trim() || null;
  } catch {
    return null;
  }
}

function readJson(path) {
  const raw = readText(path);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getAuth() {
  const auth = readJson(VERA_AUTH_PATH);
  const envToken = process.env.COWORK_TOKEN || process.env.VERA_ACCESS_TOKEN || null;
  const fileToken = readText(TOKEN_PATH);
  const authJsonToken = auth?.accessToken || null;
  const token = envToken || fileToken || authJsonToken || null;
  const tokenSource = envToken
    ? (process.env.COWORK_TOKEN ? 'COWORK_TOKEN env' : 'VERA_ACCESS_TOKEN env')
    : fileToken
      ? TOKEN_PATH
      : authJsonToken
        ? VERA_AUTH_PATH
        : null;
  const serverUrl = normalizeBaseUrl(
    process.env.COWORK_SERVER_URL ||
      process.env.VERA_SERVER_URL ||
      process.env.VERA_COWORK_API_URL ||
      auth?.serverUrl ||
      DEFAULT_SERVER_URL,
  );
  return {
    serverUrl,
    token,
    tokenSource,
    userEmail: auth?.user?.email || null,
    userId: auth?.user?.id || null,
    organizationId: auth?.user?.organizationId || null,
    expiresAt: auth?.accessTokenExpiresAt || null,
  };
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function usage() {
  console.log(`vera-cowork — Vera Cowork Server command for Letta Code\n\nUsage:\n  vera-cowork status [--verify]\n  vera-cowork login [args passed to vera-login.mjs]\n  vera-cowork get <path> [query-json]\n  vera-cowork post <path> [body-json]\n  vera-cowork put <path> [body-json]\n  vera-cowork patch <path> [body-json]\n  vera-cowork delete <path> [body-json]\n  vera-cowork install-extension\n  vera-cowork env\n\nDefaults:\n  Server: ${DEFAULT_SERVER_URL}\n\nAuth sources, without printing token values:\n  1. COWORK_TOKEN\n  2. VERA_ACCESS_TOKEN\n  3. ${TOKEN_PATH}\n  4. ${VERA_AUTH_PATH}\n\nExamples:\n  vera-cowork status --verify\n  vera-cowork get /auth/me\n  vera-cowork get /channels '{"limit":10}'\n  vera-cowork post /odoo/models/search '{"model":"res.partner","domain":[],"limit":5}'\n`);
}

function parseJsonArg(raw, fallback) {
  if (raw === undefined) return fallback;
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON argument: ${error.message}`);
  }
}

function makeUrl(serverUrl, path, query) {
  if (!path) throw new Error('path is required');
  let url;
  if (/^https?:\/\//i.test(path)) {
    url = new URL(path);
    const expected = new URL(serverUrl);
    if (url.origin !== expected.origin) {
      throw new Error(`Refusing non-Vera origin ${url.origin}; expected ${expected.origin}`);
    }
  } else {
    url = new URL(path.startsWith('/') ? path : `/${path}`, `${serverUrl}/`);
  }
  if (query && typeof query === 'object' && !Array.isArray(query)) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        for (const item of value) url.searchParams.append(key, String(item));
      } else {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url;
}

function parseBody(text, contentType) {
  if (!text) return null;
  if (contentType?.includes('application/json')) {
    try { return JSON.parse(text); } catch { return text; }
  }
  try { return JSON.parse(text); } catch { return text; }
}

async function request(method, path, jsonArg) {
  const auth = getAuth();
  if (!auth.token) {
    throw new Error('No token found. Run `vera-cowork login` first.');
  }
  const isRead = method === 'GET' || method === 'HEAD';
  const query = isRead ? parseJsonArg(jsonArg, undefined) : undefined;
  const body = isRead ? undefined : parseJsonArg(jsonArg, undefined);
  const url = makeUrl(auth.serverUrl, path, query);
  const headers = {
    authorization: `Bearer ${auth.token}`,
    accept: 'application/json',
  };
  const init = { method, headers };
  if (!isRead && body !== undefined) {
    headers['content-type'] = 'application/json';
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  const response = await fetch(url, init);
  const text = await response.text();
  const parsed = parseBody(text, response.headers.get('content-type'));
  printJson({
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    method,
    url: `${url.origin}${url.pathname}${url.search}`,
    body: parsed,
  });
  if (!response.ok) process.exitCode = 1;
}

async function status(verify) {
  const auth = getAuth();
  const out = {
    serverUrl: auth.serverUrl,
    hasToken: Boolean(auth.token),
    tokenSource: auth.tokenSource,
    userEmail: auth.userEmail,
    userId: auth.userId,
    organizationId: auth.organizationId,
    expiresAt: auth.expiresAt,
  };
  if (!verify) {
    printJson(out);
    return;
  }
  if (!auth.token) {
    printJson({ ...out, verified: false, error: 'No token found' });
    process.exitCode = 1;
    return;
  }
  const response = await fetch(`${auth.serverUrl}/auth/me`, {
    headers: { authorization: `Bearer ${auth.token}`, accept: 'application/json' },
  });
  const text = await response.text();
  printJson({
    ...out,
    verified: response.ok,
    status: response.status,
    body: parseBody(text, response.headers.get('content-type')),
  });
  if (!response.ok) process.exitCode = 1;
}

function login(args) {
  const script = existsSync(GLOBAL_LOGIN_SCRIPT) ? GLOBAL_LOGIN_SCRIPT : REPO_LOGIN_SCRIPT;
  if (!existsSync(script)) {
    throw new Error(`Login script not found. Expected ${GLOBAL_LOGIN_SCRIPT} or ${REPO_LOGIN_SCRIPT}`);
  }
  const result = spawnSync(process.execPath, [script, ...args], { stdio: 'inherit' });
  process.exit(result.status ?? 1);
}

function installExtension() {
  if (!existsSync(EXTENSION_SOURCE)) {
    throw new Error(`Extension source not found: ${EXTENSION_SOURCE}`);
  }
  const mkdir = spawnSync('mkdir', ['-p', join(homedir(), '.letta', 'extensions')], { stdio: 'inherit' });
  if (mkdir.status !== 0) process.exit(mkdir.status ?? 1);
  const cp = spawnSync('cp', [EXTENSION_SOURCE, EXTENSION_TARGET], { stdio: 'inherit' });
  if (cp.status !== 0) process.exit(cp.status ?? 1);
  printJson({
    ok: true,
    installed: EXTENSION_TARGET,
    enable: 'export COWORK_EXTENSIONS_ENABLED=true',
    restart: 'Restart Letta Code / Vera Cowork after enabling extensions.',
  });
}

function env() {
  const auth = getAuth();
  printJson({
    exports: [
      `export COWORK_SERVER_URL='${auth.serverUrl}'`,
      auth.token ? '# export COWORK_TOKEN is available from token cache/env; token value intentionally not printed.' : '# No COWORK_TOKEN found. Run: vera-cowork login',
      'export COWORK_EXTENSIONS_ENABLED=true',
    ],
  });
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === '-h' || command === '--help' || command === 'help') {
    usage();
    return;
  }
  if (command === 'status') return status(args.includes('--verify'));
  if (command === 'login') return login(args);
  if (command === 'install-extension') return installExtension();
  if (command === 'env') return env();
  if (['get', 'post', 'put', 'patch', 'delete'].includes(command)) {
    return request(command.toUpperCase(), args[0], args[1]);
  }
  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
});

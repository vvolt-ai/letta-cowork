#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_SERVER_URL = 'https://vera-cowork-server.ngrok.app';
const ENDPOINT_PATH = '/mcp';
const ENDPOINT_ENV = 'VERA_MCP_URL';
const ALLOWED_TOOLS = new Set([
  'vera_whoami',
  'vera_list_channels',
  'vera_get_channel_status',
  'vera_list_zoho_mail_read_operations',
  'vera_describe_zoho_mail_read_operation',
  'vera_call_zoho_mail_read',
  'vera_list_email_accounts',
  'vera_list_email_folders',
  'vera_list_emails',
  'vera_search_emails',
  'vera_get_email',
  'vera_list_email_attachments',
  'vera_get_email_attachment',
  'vera_read_artifact',
  'vera_list_schedules',
  'vera_get_schedule',
  'vera_list_schedule_runs',
  'vera_search_knowledge',
  'vera_list_accessible_organization_agents',
  'vera_send_message_to_organization_agent',
]);
const MAX_INPUT_BYTES = 256 * 1024;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DELEGATION_REQUEST_TIMEOUT_MS = 300_000;

class SafeClientError extends Error {}
function fail(message) { throw new SafeClientError(message); }
function safeEndpoint(value) {
  let url;
  try { url = new URL(value); } catch { fail('Invalid Vera endpoint configuration.'); }
  if (url.username || url.password || url.search || url.hash) fail('Vera endpoints must not contain credentials, query values or fragments.');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) fail('Vera requires HTTPS except explicit loopback development endpoints.');
  return url;
}

function resolveEndpoint(coworkServerUrl) {
  const explicitEndpoint = process.env[ENDPOINT_ENV]?.trim();
  const baseUrl =
    coworkServerUrl ||
    process.env.VERA_COWORK_API_URL?.trim() ||
    process.env.VERA_SERVER_URL?.trim() ||
    process.env.COWORK_SERVER_URL?.trim() ||
    DEFAULT_SERVER_URL;
  const bound = safeEndpoint(baseUrl);
  const endpoint = explicitEndpoint ? safeEndpoint(explicitEndpoint) : new URL(ENDPOINT_PATH, bound);
  if (endpoint.origin !== bound.origin) fail('Vera endpoint override does not match the authenticated session server; use an authorized matching connection.');
  if (!['/mcp', '/mcp/'].includes(endpoint.pathname)) fail('Native Vera fallback requires the /mcp endpoint.');
  return endpoint;
}

function unwrapEnvValue(value) {
  const trimmed = String(value ?? '').trim();
  if (trimmed.length >= 2) {
    const quote = trimmed[0];
    if ((quote === "'" || quote === '"') && trimmed.at(-1) === quote) {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

function parseCoworkEnv(contents) {
  const values = {};
  for (const line of String(contents ?? '').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (!['COWORK_TOKEN', 'VERA_COWORK_API_URL', 'VERA_SERVER_URL'].includes(key)) continue;
    const value = unwrapEnvValue(rawValue);
    if (value && !value.includes('\0')) values[key] = value;
  }
  return values;
}

async function resolveAuthentication() {
  const coworkEnvPath =
    process.env.VERA_COWORK_ENV_PATH?.trim() ||
    join(process.env.HOME || homedir(), '.letta-cowork', 'cowork.env');
  try {
    const values = parseCoworkEnv(await readFile(coworkEnvPath, 'utf8'));
    if (values.COWORK_TOKEN) {
      return {
        token: values.COWORK_TOKEN,
        serverUrl: values.VERA_COWORK_API_URL || values.VERA_SERVER_URL || '',
      };
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') fail('Could not read the protected Cowork session; resolve its local access before retrying.');
  }

  const coworkToken = process.env.COWORK_TOKEN?.trim();
  if (coworkToken) {
    return {
      token: coworkToken,
      serverUrl: process.env.VERA_COWORK_API_URL?.trim() || '',
    };
  }

  const veraToken = process.env.VERA_TOKEN?.trim();
  return veraToken ? { token: veraToken, serverUrl: '' } : null;
}

async function readArguments() {
  const chunks = [];
  let size = 0;

  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > MAX_INPUT_BYTES) {
      fail(`Tool arguments exceed ${MAX_INPUT_BYTES} bytes.`);
    }
    chunks.push(chunk);
  }

  const input = Buffer.concat(chunks).toString('utf8').trim();
  if (!input) return {};

  let parsed;
  try {
    parsed = JSON.parse(input);
  } catch (error) {
    fail('Tool arguments must be valid JSON; input values are not printed.');
  }

  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    fail('Tool arguments must be a JSON object.');
  }
  return parsed;
}

function parsePayload(body) {
  try {
    return JSON.parse(body);
  } catch {
    // Streamable HTTP may return an SSE envelope instead of direct JSON.
  }

  for (const line of body.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    const data = line.slice('data:'.length).trim();
    if (!data || data === '[DONE]') continue;
    try {
      return JSON.parse(data);
    } catch {
      // Keep looking for the JSON-RPC event.
    }
  }

  fail('Vera returned a response that was neither JSON nor MCP event-stream data.');
}

async function boundedResponse(response) {
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > MAX_RESPONSE_BYTES) { await response.body?.cancel(); fail('Vera MCP response exceeds the byte limit.'); }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) { await reader.cancel(); fail('Vera MCP response exceeds the byte limit.'); }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally { reader.releaseLock(); }
}

function renderResult(result) {
  const textParts = Array.isArray(result?.content)
    ? result.content
        .filter((item) => item?.type === 'text' && typeof item.text === 'string')
        .map((item) => item.text)
    : [];

  if (textParts.length > 0) return textParts.join('\n');
  if (result?.structuredContent !== undefined) {
    return JSON.stringify(result.structuredContent, null, 2);
  }
  return JSON.stringify(result, null, 2);
}

async function main() {
  const toolName = process.argv[2];
  if (!toolName || !ALLOWED_TOOLS.has(toolName)) {
    fail(
      `Usage: node call-mcp.mjs <tool-name> with one of: ${[...ALLOWED_TOOLS].join(', ')}`,
    );
  }

  const authentication = await resolveAuthentication();
  if (!authentication) {
    fail(
      'No Cowork-managed or standalone Vera token is available. Authenticate with Cowork or the approved Vera login workflow, then retry.',
    );
  }

  const argumentsObject = await readArguments();
  const endpoint = resolveEndpoint(authentication.serverUrl);
  const controller = new AbortController();
  const requestTimeoutMs =
    toolName === 'vera_send_message_to_organization_agent'
      ? DELEGATION_REQUEST_TIMEOUT_MS
      : DEFAULT_REQUEST_TIMEOUT_MS;
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  let response;

  try {
    response = await fetch(endpoint, {
      redirect: 'error',
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${authentication.token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'letta-code-vera-mcp-skill/1.0',
        'ngrok-skip-browser-warning': 'true',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: toolName, arguments: argumentsObject },
      }),
      signal: controller.signal,
    });
    if (!response.ok) { await response.body?.cancel(); fail(`Vera MCP HTTP ${response.status}; upstream error content is not printed.`); }
    const payload = parsePayload(await boundedResponse(response));
    if (payload?.error) fail('Vera MCP returned a protocol error; upstream error content is not printed.');
    if (!payload || payload.result === undefined) fail('Vera MCP response did not contain a tool result.');
    if (payload.result?.isError) fail('Vera tool reported failure; inspect sanitized server diagnostics through the authorized owner.');
    const output = renderResult(payload.result);
    if (output) process.stdout.write(`${output}\n`);
  } catch (error) {
    if (controller.signal.aborted || error?.name === 'AbortError') fail(`Vera MCP request/body timed out after ${requestTimeoutMs / 1000} seconds; outcome may be unknown. Do not blindly retry a non-idempotent operation.`);
    if (error instanceof SafeClientError) throw error;
    fail('Vera MCP request failed; verify the matching endpoint, connection and redirect policy without sharing secrets.');
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}

main().catch((error) => {
  process.stderr.write(`Error: ${error instanceof SafeClientError ? error.message : 'Native Vera helper failed; inspect local setup without sharing secret values.'}\n`);
  process.exitCode = 1;
});

#!/usr/bin/env node

const DEFAULT_SERVER_URL = 'https://vera-cowork-server.ngrok.app';
const ENDPOINT_PATH = '/neo4j-mcp';
const ENDPOINT_ENV = 'VERA_NEO4J_MCP_URL';
const ALLOWED_TOOLS = new Set([
  'neo4j_list_instances',
  'neo4j_get_schema',
  'neo4j_read',
  'neo4j_explain',
  'neo4j_write',
]);
const MAX_INPUT_BYTES = 256 * 1024;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;

function fail(message) {
  throw new Error(message);
}

function resolveEndpoint() {
  const explicitEndpoint = process.env[ENDPOINT_ENV]?.trim();
  if (explicitEndpoint) return new URL(explicitEndpoint);

  const baseUrl =
    process.env.VERA_SERVER_URL?.trim() ||
    process.env.COWORK_SERVER_URL?.trim() ||
    DEFAULT_SERVER_URL;
  return new URL(ENDPOINT_PATH, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
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
    fail(`Tool arguments must be valid JSON: ${error.message}`);
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

function errorMessage(payload) {
  const message = payload?.error?.message;
  return typeof message === 'string' && message.trim()
    ? message.trim()
    : 'Unknown MCP error';
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

  const token = process.env.VERA_TOKEN?.trim();
  if (!token) {
    fail(
      'VERA_TOKEN is unavailable. Save it to this Letta Code agent with /secret set VERA_TOKEN, then start a new session.',
    );
  }

  const argumentsObject = await readArguments();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;

  try {
    response = await fetch(resolveEndpoint(), {
      method: 'POST',
      headers: {
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'letta-code-neo4j-mcp-skill/1.0',
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
  } catch (error) {
    if (error?.name === 'AbortError') {
      fail(`Vera MCP request timed out after ${REQUEST_TIMEOUT_MS / 1000} seconds.`);
    }
    fail(`Could not reach Vera MCP: ${error.message}`);
  } finally {
    clearTimeout(timeout);
  }

  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
    fail(`Vera MCP response exceeds ${MAX_RESPONSE_BYTES} bytes.`);
  }

  const body = await response.text();
  if (Buffer.byteLength(body) > MAX_RESPONSE_BYTES) {
    fail(`Vera MCP response exceeds ${MAX_RESPONSE_BYTES} bytes.`);
  }

  const payload = parsePayload(body);
  if (!response.ok) fail(`Vera MCP HTTP ${response.status}: ${errorMessage(payload)}`);
  if (payload?.error) fail(`Vera MCP error: ${errorMessage(payload)}`);
  if (!payload || payload.result === undefined) {
    fail('Vera MCP response did not contain a tool result.');
  }

  const output = renderResult(payload.result);
  if (output) process.stdout.write(`${output}\n`);
  if (payload.result?.isError) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`Error: ${error.message}\n`);
  process.exitCode = 1;
});

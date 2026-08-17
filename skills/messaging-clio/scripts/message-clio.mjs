#!/usr/bin/env node

const DEFAULT_BASE_URL = 'https://api.letta.com';
const DEFAULT_CLIO_AGENT_ID = 'agent-800b8961-14e2-4849-acc3-e88129dfc1de';
const MAX_INPUT_BYTES = 128 * 1024;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 180_000;

function fail(message) {
  throw new Error(message);
}

function apiBaseUrl() {
  const configured = process.env.CLIO_LETTA_BASE_URL?.trim() || DEFAULT_BASE_URL;
  const withoutTrailingSlash = configured.replace(/\/+$/, '');
  return withoutTrailingSlash.replace(/\/v1$/, '');
}

function clioAgentId() {
  const value = process.env.CLIO_AGENT_ID?.trim() || DEFAULT_CLIO_AGENT_ID;
  if (!/^agent-[0-9a-f-]{36}$/i.test(value)) {
    fail('CLIO_AGENT_ID must use the agent-<uuid> format.');
  }
  return value;
}

async function readInput() {
  const chunks = [];
  let size = 0;

  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > MAX_INPUT_BYTES) fail(`Input exceeds ${MAX_INPUT_BYTES} bytes.`);
    chunks.push(chunk);
  }

  const input = Buffer.concat(chunks).toString('utf8').trim();
  if (!input) fail('Provide one JSON object on standard input.');

  let parsed;
  try {
    parsed = JSON.parse(input);
  } catch (error) {
    fail(`Input must be valid JSON: ${error.message}`);
  }

  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    fail('Input must be a JSON object.');
  }

  const message = typeof parsed.message === 'string' ? parsed.message.trim() : '';
  if (!message) fail('Input must include a non-empty message string.');
  if (Buffer.byteLength(message) > MAX_INPUT_BYTES) {
    fail(`Message exceeds ${MAX_INPUT_BYTES} bytes.`);
  }

  const conversationId =
    typeof parsed.conversationId === 'string' ? parsed.conversationId.trim() : '';
  if (conversationId && !/^conv-[0-9a-f-]{36}$/i.test(conversationId)) {
    fail('conversationId must use the conv-<uuid> format.');
  }

  const caller = typeof parsed.caller === 'string' ? parsed.caller.trim() : '';
  return { message, conversationId: conversationId || undefined, caller };
}

function callerEnvelope({ message, caller }) {
  const runtimeAgentId = process.env.AGENT_ID?.trim();
  const claimedCaller = caller || runtimeAgentId || 'unknown';
  return [
    'INTER-AGENT MESSAGE',
    `claimed_source: ${claimedCaller}`,
    'transport: shared Clio Letta API credential',
    'identity_assurance: claimed identity is not independently verified by this transport',
    '',
    message,
  ].join('\n');
}

async function readResponse(response) {
  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    fail(`Clio API response exceeds ${MAX_RESPONSE_BYTES} bytes.`);
  }

  const text = await response.text();
  if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) {
    fail(`Clio API response exceeds ${MAX_RESPONSE_BYTES} bytes.`);
  }

  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    fail(`Clio API returned non-JSON data with HTTP ${response.status}.`);
  }

  if (!response.ok) {
    const detail =
      typeof payload?.detail === 'string'
        ? payload.detail
        : typeof payload?.message === 'string'
          ? payload.message
          : JSON.stringify(payload);
    fail(`Clio API HTTP ${response.status}: ${detail.slice(0, 2_000)}`);
  }

  return payload;
}

async function request(path, token, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${apiBaseUrl()}${path}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'letta-code-messaging-clio-skill/1.0',
        ...options.headers,
      },
      signal: controller.signal,
    });
    return await readResponse(response);
  } catch (error) {
    if (error?.name === 'AbortError') {
      fail(`Clio API request timed out after ${REQUEST_TIMEOUT_MS / 1_000} seconds.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function createConversation(token, agentId) {
  const query = new URLSearchParams({ agent_id: agentId });
  const payload = await request(`/v1/conversations?${query}`, token, {
    method: 'POST',
    body: '{}',
  });
  const id = typeof payload?.id === 'string' ? payload.id : '';
  if (!/^conv-[0-9a-f-]{36}$/i.test(id)) {
    fail('Clio API did not return a valid conversation ID.');
  }
  return id;
}

function textContent(value) {
  if (typeof value === 'string') return value.trim();
  if (!Array.isArray(value)) return '';
  return value
    .map((part) => {
      if (typeof part === 'string') return part;
      if (part?.type === 'text' && typeof part.text === 'string') return part.text;
      return '';
    })
    .filter(Boolean)
    .join('\n')
    .trim();
}

function extractReply(payload) {
  const messages = Array.isArray(payload?.messages)
    ? payload.messages
    : Array.isArray(payload)
      ? payload
      : [];

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const item = messages[index];
    const kind = item?.message_type || item?.type;
    if (item?.role !== 'assistant' && kind !== 'assistant_message') continue;
    const content = textContent(item?.content) || textContent(item?.message);
    if (content) return content;
  }

  return textContent(payload?.assistant_message) || textContent(payload?.assistantText);
}

async function main() {
  const token = process.env.CLIO_LETTA_API_KEY?.trim();
  if (!token) {
    fail(
      'CLIO_LETTA_API_KEY is unavailable. Save it to this Letta Code agent with /secret set CLIO_LETTA_API_KEY, then start a new session.',
    );
  }

  const input = await readInput();
  const agentId = clioAgentId();
  const conversationId =
    input.conversationId || (await createConversation(token, agentId));
  const payload = await request(
    `/v1/conversations/${encodeURIComponent(conversationId)}/messages`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({
        messages: [
          {
            role: 'user',
            content: callerEnvelope(input),
          },
        ],
        streaming: false,
      }),
    },
  );

  const output = {
    agentId,
    conversationId,
    reply: extractReply(payload) || null,
    stopReason: payload?.stop_reason || payload?.stopReason || null,
  };

  if (!output.reply) {
    output.warning =
      'Clio returned no assistant message. Check stopReason and whether the run requires approval.';
  }
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`Error: ${error.message}\n`);
  process.exitCode = 1;
});

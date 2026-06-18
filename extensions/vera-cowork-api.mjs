import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_SERVER_URL = 'https://vera-cowork-server.ngrok.app';
const TOKEN_PATH = join(homedir(), '.letta-cowork', '.cowork-token');
const VERA_AUTH_PATH = join(homedir(), '.letta-cowork', 'vera-auth.json');

function normalizeBaseUrl(value) {
  return String(value || DEFAULT_SERVER_URL).trim().replace(/\/+$/, '');
}

function readText(path) {
  try {
    if (!existsSync(path)) return null;
    const value = readFileSync(path, 'utf8').trim();
    return value || null;
  } catch {
    return null;
  }
}

function readVeraAuthJson() {
  const raw = readText(VERA_AUTH_PATH);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getServerUrl() {
  const auth = readVeraAuthJson();
  return normalizeBaseUrl(
    process.env.COWORK_SERVER_URL ||
      process.env.VERA_SERVER_URL ||
      process.env.VERA_COWORK_API_URL ||
      auth?.serverUrl ||
      DEFAULT_SERVER_URL,
  );
}

function getTokenInfo() {
  const auth = readVeraAuthJson();
  const envToken = process.env.COWORK_TOKEN || process.env.VERA_ACCESS_TOKEN || null;
  const fileToken = readText(TOKEN_PATH);
  const authJsonToken = auth?.accessToken || null;
  const token = envToken || fileToken || authJsonToken || null;
  const source = envToken
    ? (process.env.COWORK_TOKEN ? 'COWORK_TOKEN env' : 'VERA_ACCESS_TOKEN env')
    : fileToken
      ? TOKEN_PATH
      : authJsonToken
        ? VERA_AUTH_PATH
        : null;
  return {
    token,
    source,
    userEmail: auth?.user?.email || null,
    userId: auth?.user?.id || null,
    organizationId: auth?.user?.organizationId || null,
    expiresAt: auth?.accessTokenExpiresAt || null,
  };
}

function requireToken() {
  const info = getTokenInfo();
  if (!info.token) {
    throw new Error(
      'No Vera/Cowork token found. Login first with the vera-server-login skill, then source ~/.letta-cowork/vera-auth.env or ensure ~/.letta-cowork/.cowork-token exists.',
    );
  }
  return info;
}

function joinUrl(baseUrl, path) {
  const cleanPath = String(path || '').trim();
  if (!cleanPath) throw new Error('path is required');
  if (/^https?:\/\//i.test(cleanPath)) {
    const url = new URL(cleanPath);
    const expected = new URL(baseUrl);
    if (url.origin !== expected.origin) {
      throw new Error(`Refusing to call non-Vera origin ${url.origin}; expected ${expected.origin}`);
    }
    return url;
  }
  return new URL(cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`, `${baseUrl}/`);
}

function appendQuery(url, query) {
  if (!query || typeof query !== 'object' || Array.isArray(query)) return;
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, String(item));
    } else {
      url.searchParams.set(key, String(value));
    }
  }
}

function parseResponseBody(text, contentType) {
  if (!text) return null;
  if (contentType?.includes('application/json')) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function veraRequest({ method, path, query, body }) {
  const baseUrl = getServerUrl();
  const { token } = requireToken();
  const url = joinUrl(baseUrl, path);
  appendQuery(url, query);

  const headers = {
    authorization: `Bearer ${token}`,
    accept: 'application/json',
  };
  const init = { method, headers };
  if (body !== undefined && body !== null && method !== 'GET' && method !== 'HEAD') {
    headers['content-type'] = 'application/json';
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }

  const response = await fetch(url, init);
  const text = await response.text();
  const parsed = parseResponseBody(text, response.headers.get('content-type'));
  const result = {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    method,
    url: `${url.origin}${url.pathname}${url.search}`,
    body: parsed,
  };

  return {
    output: JSON.stringify(result, null, 2),
    isError: !response.ok,
  };
}

const pathQuerySchema = {
  type: 'object',
  properties: {
    path: {
      type: 'string',
      description: 'Vera API path, e.g. /auth/me, /channels, /mcp/agents/<agentId>/env-keys. Absolute URLs are allowed only for the configured Vera origin.',
    },
    query: {
      type: 'object',
      description: 'Optional query params as key/value pairs.',
      additionalProperties: true,
    },
  },
  required: ['path'],
  additionalProperties: false,
};

const bodySchema = {
  type: 'object',
  properties: {
    path: pathQuerySchema.properties.path,
    query: pathQuerySchema.properties.query,
    body: {
      type: ['object', 'array', 'string', 'number', 'boolean', 'null'],
      description: 'JSON request body.',
    },
  },
  required: ['path'],
  additionalProperties: false,
};

export function activate(cowork) {
  cowork.tools.register({
    name: 'vera_auth_status',
    description: 'Check whether this local Letta Code/Cowork runtime can authenticate to Vera Cowork Server. Returns token source metadata only; never returns token values.',
    parameters: {
      type: 'object',
      properties: {
        verify: {
          type: 'boolean',
          description: 'When true, call /auth/me to verify the token with the server.',
          default: false,
        },
      },
      additionalProperties: false,
    },
    run: async ({ args }) => {
      const tokenInfo = getTokenInfo();
      const status = {
        serverUrl: getServerUrl(),
        hasToken: Boolean(tokenInfo.token),
        tokenSource: tokenInfo.source,
        userEmail: tokenInfo.userEmail,
        userId: tokenInfo.userId,
        organizationId: tokenInfo.organizationId,
        expiresAt: tokenInfo.expiresAt,
      };
      if (args.verify) {
        if (!tokenInfo.token) {
          return { output: JSON.stringify({ ...status, verified: false, error: 'No token found' }, null, 2), isError: true };
        }
        const verifyResult = await veraRequest({ method: 'GET', path: '/auth/me' });
        const parsed = JSON.parse(verifyResult.output);
        return {
          output: JSON.stringify({ ...status, verified: !verifyResult.isError, authMe: parsed.body }, null, 2),
          isError: verifyResult.isError,
        };
      }
      return JSON.stringify(status, null, 2);
    },
  });

  cowork.tools.register({
    name: 'vera_login_instructions',
    description: 'Return safe terminal commands for logging into Vera Cowork Server for Letta Code/Cowork API use. Does not request or print tokens.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    run: async () => JSON.stringify({
      serverUrl: DEFAULT_SERVER_URL,
      steps: [
        'Open a normal terminal, not an agent Bash tool.',
        'Run: ~/.letta/skills/vera-server-login/scripts/vera-login.mjs',
        'Then run: source ~/.letta-cowork/vera-auth.env',
        'Restart Letta Code/Cowork if the running Electron process needs to inherit newly exported environment variables.',
      ],
      tokenFilesCheckedByExtension: [TOKEN_PATH, VERA_AUTH_PATH],
      envVarsCheckedByExtension: ['COWORK_TOKEN', 'VERA_ACCESS_TOKEN', 'COWORK_SERVER_URL', 'VERA_SERVER_URL', 'VERA_COWORK_API_URL'],
    }, null, 2),
  });

  cowork.tools.register({
    name: 'vera_api_get',
    description: 'Call a Vera Cowork Server GET endpoint with the cached local Vera/Cowork token. Never returns token values.',
    parameters: pathQuerySchema,
    run: async ({ args }) => veraRequest({ method: 'GET', path: args.path, query: args.query }),
  });

  cowork.tools.register({
    name: 'vera_api_post',
    description: 'Call a Vera Cowork Server POST endpoint with the cached local Vera/Cowork token. Use for API writes only when the user requested the action.',
    parameters: bodySchema,
    run: async ({ args }) => veraRequest({ method: 'POST', path: args.path, query: args.query, body: args.body }),
  });

  cowork.tools.register({
    name: 'vera_api_put',
    description: 'Call a Vera Cowork Server PUT endpoint with the cached local Vera/Cowork token. Use for API writes only when the user requested the action.',
    parameters: bodySchema,
    run: async ({ args }) => veraRequest({ method: 'PUT', path: args.path, query: args.query, body: args.body }),
  });

  cowork.tools.register({
    name: 'vera_api_patch',
    description: 'Call a Vera Cowork Server PATCH endpoint with the cached local Vera/Cowork token. Use for API writes only when the user requested the action.',
    parameters: bodySchema,
    run: async ({ args }) => veraRequest({ method: 'PATCH', path: args.path, query: args.query, body: args.body }),
  });

  cowork.tools.register({
    name: 'vera_api_delete',
    description: 'Call a Vera Cowork Server DELETE endpoint with the cached local Vera/Cowork token. Destructive: use only with explicit user instruction.',
    parameters: bodySchema,
    run: async ({ args }) => veraRequest({ method: 'DELETE', path: args.path, query: args.query, body: args.body }),
  });
}

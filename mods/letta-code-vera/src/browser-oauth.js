import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";

const OAUTH_TIMEOUT_MS = 5 * 60 * 1000;

function randomBase64Url(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function pkceChallenge(verifier) {
  return createHash("sha256").update(verifier).digest("base64url");
}

function parseJsonResponse(text, status) {
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = {};
  }
  if (status < 200 || status >= 300) {
    const detail = payload.error_description || payload.message || payload.error;
    throw new Error(detail || `OAuth request failed with HTTP ${status}`);
  }
  return payload;
}

async function requestJson(fetchImpl, url, options = {}) {
  const response = await fetchImpl(url, options);
  return parseJsonResponse(await response.text(), response.status);
}

export function systemBrowserCommand(url, platform = process.platform) {
  const target = String(url);
  return platform === "darwin"
    ? ["open", [target]]
    : platform === "win32"
      ? ["rundll32.exe", ["url.dll,FileProtocolHandler", target]]
      : ["xdg-open", [target]];
}

export function openSystemBrowser(url, platform = process.platform) {
  const command = systemBrowserCommand(url, platform);
  return new Promise((resolve, reject) => {
    const child = spawn(command[0], command[1], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

function callbackServer(expectedState, signal) {
  let resolveCallback;
  let rejectCallback;
  const callback = new Promise((resolve, reject) => {
    resolveCallback = resolve;
    rejectCallback = reject;
  });
  const server = createServer((request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    if (url.pathname !== "/vera-oauth/callback") {
      response.writeHead(404).end("Not found");
      return;
    }
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");
    const code = url.searchParams.get("code");
    if (state !== expectedState) {
      response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
      response.end("Vera authorization failed: invalid state.");
      rejectCallback(new Error("Vera OAuth callback state did not match"));
      return;
    }
    if (error || !code) {
      response.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
      response.end("Vera authorization was denied. You can close this window.");
      rejectCallback(
        new Error(
          url.searchParams.get("error_description") ||
            error ||
            "Vera authorization did not return a code",
        ),
      );
      return;
    }
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(
      "<!doctype html><meta charset=utf-8><title>Vera connected</title><h1>Vera connected</h1><p>You can close this window and return to Letta Code.</p>",
    );
    resolveCallback(code);
  });

  const timeout = setTimeout(
    () => rejectCallback(new Error("Vera browser authorization timed out")),
    OAUTH_TIMEOUT_MS,
  );
  timeout.unref?.();
  const abort = () => rejectCallback(new Error("Vera browser authorization cancelled"));
  signal?.addEventListener("abort", abort, { once: true });

  return {
    server,
    callback,
    cleanup() {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      server.close();
    },
  };
}

export async function authorizeInBrowser(options) {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const launchBrowser = options.openBrowser ?? openSystemBrowser;
  const serverUrl = String(options.serverUrl).replace(/\/+$/, "");
  const scopes = [...new Set(options.scopes || ["vera:mcp"])];
  const state = randomBase64Url();
  const verifier = randomBase64Url(48);
  const listener = callbackServer(state, options.signal);

  try {
    await new Promise((resolve, reject) => {
      listener.server.once("error", reject);
      listener.server.listen(0, "127.0.0.1", resolve);
    });
    const address = listener.server.address();
    if (!address || typeof address === "string") {
      throw new Error("Could not create the Vera OAuth callback listener");
    }
    const redirectUri = `http://127.0.0.1:${address.port}/vera-oauth/callback`;
    const metadata = await requestJson(
      fetchImpl,
      `${serverUrl}/.well-known/oauth-authorization-server`,
      { signal: options.signal },
    );
    const client = await requestJson(fetchImpl, metadata.registration_endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_name: options.clientName || "Vera for Letta Code",
        redirect_uris: [redirectUri],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
      }),
      signal: options.signal,
    });
    const authorizeUrl = new URL(metadata.authorization_endpoint);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", client.client_id);
    authorizeUrl.searchParams.set("redirect_uri", redirectUri);
    authorizeUrl.searchParams.set("scope", scopes.join(" "));
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("code_challenge", pkceChallenge(verifier));
    authorizeUrl.searchParams.set("code_challenge_method", "S256");
    authorizeUrl.searchParams.set("resource", `${serverUrl}/mcp`);
    await launchBrowser(authorizeUrl.href);

    const code = await listener.callback;
    const tokens = await requestJson(fetchImpl, metadata.token_endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: client.client_id,
        code,
        code_verifier: verifier,
        redirect_uri: redirectUri,
        resource: `${serverUrl}/mcp`,
      }),
      signal: options.signal,
    });
    if (!tokens.access_token) {
      throw new Error("Vera OAuth did not return an access token");
    }
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || "",
      expiresIn: tokens.expires_in ?? null,
      scope: tokens.scope || scopes.join(" "),
      tokenType: tokens.token_type || "Bearer",
      oauthClientId: client.client_id,
    };
  } finally {
    listener.cleanup();
  }
}

export async function revokeBrowserOAuth(options) {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const metadata = await requestJson(
    fetchImpl,
    `${String(options.serverUrl).replace(/\/+$/, "")}/.well-known/oauth-authorization-server`,
    { signal: options.signal },
  );
  const response = await fetchImpl(metadata.revocation_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      token: options.token,
      token_type_hint: options.tokenTypeHint || "refresh_token",
      client_id: options.clientId,
    }),
    signal: options.signal,
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Vera OAuth revocation failed with HTTP ${response.status}`);
  }
}

export async function refreshBrowserOAuth(options) {
  const metadata = await requestJson(
    options.fetch ?? globalThis.fetch,
    `${String(options.serverUrl).replace(/\/+$/, "")}/.well-known/oauth-authorization-server`,
    { signal: options.signal },
  );
  const tokens = await requestJson(
    options.fetch ?? globalThis.fetch,
    metadata.token_endpoint,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: options.clientId,
        refresh_token: options.refreshToken,
        resource: `${String(options.serverUrl).replace(/\/+$/, "")}/mcp`,
      }),
      signal: options.signal,
    },
  );
  if (!tokens.access_token) {
    throw new Error("Vera OAuth refresh did not return an access token");
  }
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || options.refreshToken,
    scope: tokens.scope || options.scope || "vera:mcp",
    tokenType: tokens.token_type || "Bearer",
  };
}

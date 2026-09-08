import { readFile } from "node:fs/promises";
import { basename } from "node:path";

import { readCoworkAuth } from "./cowork-auth.js";
import {
  authorizeInBrowser,
  refreshBrowserOAuth,
  revokeBrowserOAuth,
} from "./browser-oauth.js";
import {
  bodySha256,
  createChallengeRequest,
  ensureMasterIdentity,
  readMasterIdentity,
  saveMasterEnrollment,
  signMasterAssertion,
} from "./master-identity.js";
import { clearAuth, normalizeServerUrl, readState, writeState } from "./state.js";

const ACCESS_TOKEN_SKEW_SECONDS = 60;
const MAX_RESPONSE_TEXT = 20_000;

export class VeraApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "VeraApiError";
    this.status = options.status ?? null;
    this.code = options.code ?? null;
  }
}

function decodeJwtPayload(token) {
  try {
    const payload = String(token).split(".")[1];
    if (!payload) return null;
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export function accessTokenIsFresh(token, nowSeconds = Date.now() / 1000) {
  if (!token) return false;
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== "number") return true;
  return payload.exp - ACCESS_TOKEN_SKEW_SECONDS > nowSeconds;
}

function responseErrorMessage(payload, status) {
  if (payload && typeof payload === "object") {
    const value = payload.message ?? payload.error ?? payload.detail;
    if (Array.isArray(value)) return value.join("; ");
    if (typeof value === "string" && value.trim()) return value;
  }
  if (typeof payload === "string" && payload.trim()) return payload.slice(0, 500);
  return `Vera request failed with HTTP ${status}`;
}

async function parseResponse(response) {
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  try {
    // Parse the complete payload. MCP tool catalogs commonly exceed the text
    // preview limit, and truncating before JSON.parse turns a valid catalog
    // into an invalid string that looks like an empty tool list to callers.
    return JSON.parse(text);
  } catch {
    // Bound only non-JSON/error text returned to callers.
    return text.slice(0, MAX_RESPONSE_TEXT);
  }
}

function safeInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

export class VeraClient {
  constructor(options = {}) {
    this.env = options.env ?? process.env;
    this.fetch = options.fetch ?? globalThis.fetch;
    if (typeof this.fetch !== "function") {
      throw new Error("Vera integration requires a runtime with fetch support");
    }
    this.openBrowser = options.openBrowser;
    this.refreshPromise = null;
  }

  async getState() {
    return readState(this.env);
  }

  async getConnectionInfo() {
    const [state, coworkAuth] = await Promise.all([
      this.getState(),
      readCoworkAuth(this.env),
    ]);
    return {
      connected: Boolean(coworkAuth || state.auth),
      source: coworkAuth
        ? "cowork"
        : state.auth?.authType === "oauth"
          ? "browser-oauth"
          : state.auth
            ? "letta-code"
            : null,
      serverUrl: normalizeServerUrl(coworkAuth?.serverUrl || state.serverUrl),
      pendingEmail: state.pendingEmail,
    };
  }

  async setServerUrl(serverUrl) {
    const normalizedServerUrl = normalizeServerUrl(serverUrl);
    let state = await this.getState();
    if (state.serverUrl === normalizedServerUrl) return state;

    if (state.auth) {
      await this.logout().catch(() => undefined);
      state = await this.getState();
    }
    state.serverUrl = normalizedServerUrl;
    state.pendingEmail = null;
    state.auth = null;
    return writeState(state, this.env);
  }

  async connectInBrowser(signal) {
    const state = await this.getState();
    const auth = await authorizeInBrowser({
      serverUrl: state.serverUrl,
      scopes: ["vera:mcp"],
      fetch: this.fetch,
      openBrowser: this.openBrowser,
      signal,
    });
    state.pendingEmail = null;
    state.auth = {
      accessToken: auth.accessToken,
      refreshToken: auth.refreshToken,
      refreshTokenExpiresAt: null,
      user: null,
      currentOrganization: null,
      authType: "oauth",
      oauthClientId: auth.oauthClientId,
      scope: auth.scope,
    };
    await writeState(state, this.env);
    return state.auth;
  }

  async requestOtp(email) {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      throw new Error("Enter a valid email address");
    }

    const state = await this.getState();
    const response = await this.request("/auth/otp/request", {
      method: "POST",
      body: { email: normalizedEmail },
      authenticated: false,
      retryAuth: false,
    });
    state.pendingEmail = normalizedEmail;
    state.auth = null;
    await writeState(state, this.env);
    return {
      email: normalizedEmail,
      message:
        typeof response?.message === "string" ? response.message.trim() : null,
    };
  }

  async verifyOtp(otp) {
    const normalizedOtp = String(otp || "").trim();
    if (!/^\d{6}$/.test(normalizedOtp)) {
      throw new Error("OTP must contain exactly six digits");
    }

    const state = await this.getState();
    if (!state.pendingEmail) {
      throw new Error("No pending Vera login. Run /vera-connect <email> first.");
    }

    const auth = await this.request("/auth/otp/verify", {
      method: "POST",
      body: { email: state.pendingEmail, otp: normalizedOtp },
      authenticated: false,
      retryAuth: false,
    });

    if (!auth?.accessToken || !auth?.refreshToken) {
      throw new Error("Vera OTP verification did not return authentication tokens");
    }

    state.pendingEmail = null;
    state.auth = {
      accessToken: auth.accessToken,
      refreshToken: auth.refreshToken,
      refreshTokenExpiresAt: auth.refreshTokenExpiresAt ?? null,
      user: auth.user ?? null,
      currentOrganization: auth.currentOrganization ?? null,
      authType: "otp",
      oauthClientId: null,
      scope: null,
    };
    await writeState(state, this.env);
    return state.auth;
  }

  async logout() {
    let state = await this.getState();
    const coworkManaged = Boolean(await readCoworkAuth(this.env));
    const hadLocalAuth = Boolean(state.auth);
    try {
      if (state.auth?.refreshToken) {
        if (state.auth.authType === "oauth") {
          await revokeBrowserOAuth({
            serverUrl: state.serverUrl,
            clientId: state.auth.oauthClientId,
            token: state.auth.refreshToken,
            fetch: this.fetch,
          });
        } else {
          const accessToken = await this.getStoredAccessToken();
          // getStoredAccessToken may rotate the refresh token, so reload before logout.
          state = await this.getState();
          await this.request("/auth/logout", {
            method: "POST",
            body: { refreshToken: state.auth?.refreshToken },
            accessToken,
            authenticated: true,
            retryAuth: false,
          });
        }
      }
    } finally {
      await clearAuth(this.env);
    }
    return { coworkManaged, hadLocalAuth };
  }

  async refreshAccessToken() {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.performRefresh().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  async performRefresh() {
    const state = await this.getState();
    const refreshToken = state.auth?.refreshToken;
    if (!refreshToken) {
      throw new VeraApiError("Not connected to Vera. Run /vera-connect first.", {
        code: "not_connected",
      });
    }

    if (state.auth?.authType === "oauth" && !state.auth.oauthClientId) {
      throw new VeraApiError(
        "Vera OAuth client state is incomplete. Run /vera-connect again.",
      );
    }
    const auth =
      state.auth?.authType === "oauth"
        ? await refreshBrowserOAuth({
            serverUrl: state.serverUrl,
            clientId: state.auth.oauthClientId,
            refreshToken,
            scope: state.auth.scope,
            fetch: this.fetch,
          })
        : await this.request("/auth/refresh", {
            method: "POST",
            body: { refreshToken },
            authenticated: false,
            retryAuth: false,
          });
    if (!auth?.accessToken || !auth?.refreshToken) {
      throw new VeraApiError("Vera returned an invalid refresh response");
    }

    state.auth = {
      accessToken: auth.accessToken,
      refreshToken: auth.refreshToken,
      refreshTokenExpiresAt: auth.refreshTokenExpiresAt ?? null,
      user: auth.user ?? state.auth?.user ?? null,
      currentOrganization:
        auth.currentOrganization ?? state.auth?.currentOrganization ?? null,
      authType: state.auth?.authType ?? "otp",
      oauthClientId: state.auth?.oauthClientId ?? null,
      scope: auth.scope ?? state.auth?.scope ?? null,
    };
    await writeState(state, this.env);
    return state.auth.accessToken;
  }

  async getStoredAccessToken() {
    const state = await this.getState();
    const accessToken = state.auth?.accessToken;
    if (accessTokenIsFresh(accessToken)) return accessToken;
    return this.refreshAccessToken();
  }

  async resolveAuthentication() {
    const coworkAuth = await readCoworkAuth(this.env);
    if (coworkAuth) {
      return {
        accessToken: coworkAuth.accessToken,
        serverUrl: coworkAuth.serverUrl,
        source: "cowork",
      };
    }
    return {
      accessToken: await this.getStoredAccessToken(),
      serverUrl: null,
      source: "letta-code",
    };
  }

  async getAccessToken() {
    return (await this.resolveAuthentication()).accessToken;
  }

  async request(pathname, options = {}) {
    const state = await this.getState();
    const authenticated = options.authenticated !== false;
    const headers = new Headers(options.headers ?? {});
    let authentication = null;

    if (authenticated) {
      authentication = options.accessToken
        ? {
            accessToken: options.accessToken,
            serverUrl: options.serverUrl ?? null,
            source: options.authSource ?? "explicit",
          }
        : await this.resolveAuthentication();
      headers.set("authorization", `Bearer ${authentication.accessToken}`);
    }
    if (options.body !== undefined && !(options.body instanceof FormData)) {
      headers.set("content-type", "application/json");
    }

    const serverUrl = normalizeServerUrl(
      options.serverUrl || authentication?.serverUrl || state.serverUrl,
    );
    const response = await this.fetch(`${serverUrl}${pathname}`, {
      method: options.method ?? "GET",
      headers,
      body:
        options.body === undefined
          ? undefined
          : options.body instanceof FormData
            ? options.body
            : JSON.stringify(options.body),
      signal: options.signal,
    });
    const payload = await parseResponse(response);

    if (response.status === 401 && authenticated && options.retryAuth !== false) {
      if (authentication?.source === "cowork") {
        const latestCoworkAuth = await readCoworkAuth(this.env);
        if (
          latestCoworkAuth?.accessToken &&
          latestCoworkAuth.accessToken !== authentication.accessToken
        ) {
          return this.request(pathname, {
            ...options,
            accessToken: latestCoworkAuth.accessToken,
            authSource: "cowork",
            serverUrl: latestCoworkAuth.serverUrl || serverUrl,
            retryAuth: false,
          });
        }
      } else if (state.auth?.refreshToken) {
        const refreshedToken = await this.refreshAccessToken();
        return this.request(pathname, {
          ...options,
          accessToken: refreshedToken,
          authSource: "letta-code",
          serverUrl,
          retryAuth: false,
        });
      }
    }

    if (!response.ok) {
      throw new VeraApiError(responseErrorMessage(payload, response.status), {
        status: response.status,
      });
    }
    return payload;
  }

  async getMasterEnrollment() {
    const identity = await readMasterIdentity(this.env);
    if (!identity) return null;
    return {
      installationId: identity.installationId,
      enrolledAgentId: identity.enrolledAgentId,
      assignmentId: identity.assignmentId,
      assignmentRevision: identity.assignmentRevision,
      serverUrl: identity.serverUrl,
      publicKeyFingerprint: identity.publicKeyFingerprint,
      enrolledAt: identity.enrolledAt,
    };
  }

  async enrollMasterAgent(agentId, deviceName, signal) {
    const identity = await ensureMasterIdentity(this.env);
    const state = await this.getState();
    const serverUrl = state.serverUrl;
    const authentication = await authorizeInBrowser({
      serverUrl,
      scopes: ["vera:master-enroll"],
      clientName: "Master Clio enrollment for Letta Code",
      fetch: this.fetch,
      openBrowser: this.openBrowser,
      signal,
    });
    try {
      const enrollment = await this.request(
        "/master-agent-auth/installations/enroll",
        {
          method: "POST",
          body: {
            agentId,
            deviceName: String(deviceName || "Letta Code").trim().slice(0, 120),
            publicKeyPem: identity.publicKeyPem,
            publicKeyFingerprint: identity.publicKeyFingerprint,
          },
          accessToken: authentication.accessToken,
          authSource: "master-enrollment-oauth",
          serverUrl,
          signal,
        },
      );
      if (
        !enrollment?.installationId ||
        !enrollment?.assignmentId ||
        !Number.isInteger(enrollment?.assignmentRevision)
      ) {
        throw new VeraApiError("Vera returned an invalid Master Clio enrollment");
      }
      await saveMasterEnrollment(
        {
          installationId: enrollment.installationId,
          agentId,
          assignmentId: enrollment.assignmentId,
          assignmentRevision: enrollment.assignmentRevision,
          serverUrl,
          enrolledAt: enrollment.enrolledAt,
        },
        this.env,
      );
      return this.getMasterEnrollment();
    } finally {
      const revoke = (token, tokenTypeHint) =>
        token
          ? revokeBrowserOAuth({
              serverUrl,
              clientId: authentication.oauthClientId,
              token,
              tokenTypeHint,
              fetch: this.fetch,
            }).catch(() => undefined)
          : Promise.resolve();
      await Promise.all([
        revoke(authentication.refreshToken, "refresh_token"),
        revoke(authentication.accessToken, "access_token"),
      ]);
    }
  }

  async requestAsMaster(pathname, agentId, options = {}) {
    const identity = await readMasterIdentity(this.env);
    if (!identity?.installationId || !identity.enrolledAgentId) {
      throw new VeraApiError(
        "This Letta Code installation is not enrolled for Master Clio. Run /vera-master-enroll first.",
        { code: "master_not_enrolled" },
      );
    }
    if (identity.enrolledAgentId !== agentId) {
      throw new VeraApiError(
        "The active agent does not match the enrolled Master Clio identity.",
        { code: "master_agent_mismatch" },
      );
    }

    const method = String(options.method || "GET").toUpperCase();
    const requestBodySha256 = bodySha256(options.body);
    const challenge = await this.request("/master-agent-auth/challenges", {
      method: "POST",
      body: createChallengeRequest(identity, {
        agentId,
        method,
        path: pathname,
        bodySha256: requestBodySha256,
      }),
      serverUrl: identity.serverUrl,
      retryAuth: false,
      signal: options.signal,
    });
    if (!challenge?.challengeId || !challenge?.nonce) {
      throw new VeraApiError("Vera returned an invalid Master Clio challenge");
    }

    const assertion = {
      challengeId: challenge.challengeId,
      nonce: challenge.nonce,
      installationId: identity.installationId,
      agentId,
      timestamp: new Date().toISOString(),
      method,
      path: pathname,
      bodySha256: requestBodySha256,
    };
    const tokenResult = await this.request("/master-agent-auth/tokens/exchange", {
      method: "POST",
      body: {
        ...assertion,
        signature: signMasterAssertion(identity, assertion),
      },
      serverUrl: identity.serverUrl,
      retryAuth: false,
      signal: options.signal,
    });
    if (!tokenResult?.accessToken) {
      throw new VeraApiError("Vera did not return a Master Clio access token");
    }

    return this.request(pathname, {
      ...options,
      accessToken: tokenResult.accessToken,
      authSource: "master-agent",
      serverUrl: identity.serverUrl,
      retryAuth: false,
    });
  }

  async getMasterStatus(agentId, signal) {
    const enrollment = await this.getMasterEnrollment();
    const remote = await this.requestAsMaster(
      "/master-agent-access/status",
      agentId,
      { signal },
    );
    return { enrollment, remote };
  }

  async listMasterOrganizations(agentId, signal) {
    return this.requestAsMaster(
      "/master-agent-access/organizations",
      agentId,
      { signal },
    );
  }

  async listMasterOrganizationAgents(agentId, organizationId, signal) {
    return this.requestAsMaster(
      `/master-agent-access/organizations/${encodeURIComponent(organizationId)}/agents`,
      agentId,
      { signal },
    );
  }

  async getProfile(signal) {
    return this.request("/auth/me", { signal });
  }

  async listMcpTools(signal) {
    const tools = await this.request("/mcp/tools", { signal });
    return Array.isArray(tools) ? tools : [];
  }

  async invokeMcpTool(toolName, args, signal) {
    return this.request("/mcp/tools/invoke", {
      method: "POST",
      body: { toolName, args: args ?? {} },
      signal,
    });
  }

  async listOrganizationAgents(signal) {
    const agents = await this.request("/organization-agents", { signal });
    return Array.isArray(agents) ? agents : [];
  }

  async delegateToOrganizationAgent(input, signal) {
    return this.request("/organization-agents/delegate", {
      method: "POST",
      body: {
        agentId: input.agentId,
        description: input.description,
        prompt: input.prompt,
        confirm: true,
      },
      signal,
    });
  }

  async listChannels(signal) {
    const channels = await this.request("/channels/accessible", { signal });
    return Array.isArray(channels) ? channels : [];
  }

  async getChannelMessages(channelId, options = {}, signal) {
    const params = new URLSearchParams();
    if (options.direction) params.set("direction", options.direction);
    params.set("limit", String(safeInteger(options.limit, 50, 1, 100)));
    params.set("offset", String(safeInteger(options.offset, 0, 0, 100_000)));
    return this.request(
      `/channels/${encodeURIComponent(channelId)}/messages?${params.toString()}`,
      { signal },
    );
  }

  async sendChannelMessage(channelId, input, signal) {
    return this.request(`/channels/${encodeURIComponent(channelId)}/send`, {
      method: "POST",
      body: {
        to: input.to,
        content: input.content,
        contentType: input.contentType || "text",
        toolName: "vera_channel_send",
        conversationId: input.conversationId || undefined,
        sourceChannelId: channelId,
      },
      signal,
    });
  }

  async sendChannelFile(channelId, input, signal) {
    const data = await readFile(input.filePath);
    const form = new FormData();
    form.set(
      "file",
      new Blob([data], { type: input.mimeType || "application/octet-stream" }),
      input.fileName || basename(input.filePath),
    );
    form.set("to", input.to);
    if (input.fileName) form.set("fileName", input.fileName);
    if (input.mimeType) form.set("mimeType", input.mimeType);
    if (input.caption) form.set("caption", input.caption);
    form.set("toolName", "vera_channel_send_file");
    if (input.conversationId) form.set("conversationId", input.conversationId);
    form.set("sourceChannelId", channelId);

    return this.request(
      `/channels/${encodeURIComponent(channelId)}/send-file-upload`,
      { method: "POST", body: form, signal },
    );
  }
}

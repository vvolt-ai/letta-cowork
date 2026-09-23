import Letta from "@letta-ai/letta-client";

import { getVeraCoworkApiClient } from "../../api/index.js";

export interface LettaRuntimeConfig {
  apiKey: string;
  baseURL: string;
  defaultHeaders?: Record<string, string>;
  fetch?: typeof fetch;
  source: "vera" | "local";
}

/**
 * Explicit wire value for Vera's organization-default Letta account.
 *
 * An omitted header used to be indistinguishable from a caller that forgot to
 * propagate its conversation account. Keeping the default explicit prevents a
 * later multi-account flow from accidentally inheriting unrelated state.
 */
export const ORGANIZATION_DEFAULT_LETTA_CONNECTION = "organization-default";

export function getLettaConnectionScope(connectionId?: string): string {
  return connectionId?.trim() || ORGANIZATION_DEFAULT_LETTA_CONNECTION;
}

function withBearerToken(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  accessToken: string,
): RequestInit {
  const sourceHeaders = init?.headers
    ?? (typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined);
  const headers = new Headers(sourceHeaders);
  headers.set("Authorization", `Bearer ${accessToken}`);
  return { ...init, headers };
}

/**
 * Fetch adapter for the Letta SDK. Vera access tokens can rotate while Cowork
 * is open, so retry one unauthorized request after BaseHttpClient refreshes it.
 */
function createVeraRuntimeFetch(): typeof fetch {
  return async (input, init) => {
    const api = getVeraCoworkApiClient();
    const firstToken = api.accessToken;
    if (!firstToken) {
      throw new Error("Sign in to Vera before using organization Letta accounts.");
    }

    const retryInput = typeof Request !== "undefined" && input instanceof Request
      ? input.clone()
      : input;
    let response = await fetch(input, withBearerToken(input, init, firstToken));
    if (response.status !== 401) return response;

    // Any authenticated endpoint is enough to invoke BaseHttpClient's guarded
    // refresh-and-retry path. The refreshed token remains inside the API client.
    await api.request("/auth/me", { suppressAuthExpired: true });
    const refreshedToken = api.accessToken;
    if (!refreshedToken || refreshedToken === firstToken) return response;

    await response.body?.cancel().catch(() => undefined);
    response = await fetch(
      retryInput,
      withBearerToken(retryInput, init, refreshedToken),
    );
    return response;
  };
}

export function selectLettaRuntimeSource(
  localApiKey?: string | null,
  veraAccessToken?: string | null,
): LettaRuntimeConfig["source"] | null {
  if (localApiKey?.trim()) return "local";
  if (veraAccessToken?.trim()) return "vera";
  return null;
}

export function getLettaRuntimeConfig(connectionId?: string): LettaRuntimeConfig {
  const localApiKey = (process.env.LETTA_API_KEY || "").trim();
  const api = getVeraCoworkApiClient();
  const accessToken = api.accessToken?.trim();
  const source = selectLettaRuntimeSource(localApiKey, accessToken);

  if (source === "local") {
    return {
      apiKey: localApiKey,
      baseURL: (process.env.LETTA_BASE_URL || "https://api.letta.com").trim(),
      source,
    };
  }

  if (source === "vera" && accessToken) {
    const defaultHeaders: Record<string, string> = {
      "X-Letta-Source": "vera-cowork-desktop",
    };
    defaultHeaders["x-letta-connection-id"] = getLettaConnectionScope(connectionId);
    return {
      apiKey: accessToken,
      baseURL: `${api.apiBaseUrl.replace(/\/$/, "")}/letta/runtime`,
      defaultHeaders,
      fetch: createVeraRuntimeFetch(),
      source,
    };
  }

  throw new Error(
    "No Letta account is available. Configure a local LETTA_API_KEY or sign in to Vera.",
  );
}

export function getLettaRuntimeRequestBase(
  config: Pick<LettaRuntimeConfig, "baseURL" | "source">,
): string {
  const trimmedBase = config.baseURL.replace(/\/$/, "");
  return config.source === "local" && !trimmedBase.endsWith("/v1")
    ? `${trimmedBase}/v1`
    : trimmedBase;
}

export async function fetchLettaRuntime(
  path: string,
  init: RequestInit = {},
  connectionId?: string,
): Promise<Response> {
  const config = getLettaRuntimeConfig(connectionId);
  const requestBase = getLettaRuntimeRequestBase(config);
  const headers = new Headers(config.defaultHeaders);
  new Headers(init.headers).forEach((value, name) => headers.set(name, value));
  headers.set("Authorization", `Bearer ${config.apiKey}`);
  const runtimeFetch = config.fetch ?? fetch;
  return runtimeFetch(`${requestBase}/${path.replace(/^\//, "")}`, {
    ...init,
    headers,
  });
}

export function createLettaRuntimeClient(connectionId?: string): Letta {
  const config = getLettaRuntimeConfig(connectionId);
  return new Letta({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    defaultHeaders: config.defaultHeaders,
    fetch: config.fetch,
  });
}

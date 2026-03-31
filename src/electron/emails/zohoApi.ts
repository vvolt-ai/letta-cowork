/* eslint-disable @typescript-eslint/no-explicit-any */

/* ============================================================
   ZOHO API CLIENT (Direct Zoho Mail API)
============================================================ */

import { BASE_URL, getAccessToken, getRefreshToken, removeToken, saveAccessToken } from "./helper.js";
import { storeEmailTokensOnServer } from "../apiClient.js";
import { Agent, setGlobalDispatcher } from 'undici';

// Set global undici agent with longer connection timeout
setGlobalDispatcher(new Agent({
  connectTimeout: 60000, // 60 seconds to establish connection
  headersTimeout: 60000, // 60 seconds to receive headers
  bodyTimeout: 120000, // 120 seconds for body
}));

// Prevent multiple simultaneous refresh calls
let refreshPromise: Promise<string> | null = null;

export async function refreshToken(): Promise<string> {
  if (refreshPromise) {
    return refreshPromise; // prevent parallel refresh
  }

  refreshPromise = (async () => {
    const refreshTokenValue = await getRefreshToken();
    if (!refreshTokenValue) {
      throw new Error("No refresh token found");
    }

    const response = await fetch(`${BASE_URL}/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshTokenValue }),
    });

    if (!response.ok) {
      removeToken(); // Clear tokens on refresh failure
      throw new Error("Refresh token failed");
      
    }

    const data = await response.json();
    await saveAccessToken(data.access_token);

    // Update tokens on server
    try {
      await storeEmailTokensOnServer({
        accessToken: data.access_token,
        refreshToken: refreshTokenValue,
        tokenExpiresAt: Date.now() + 3600000, // 1 hour
      });
      console.log("[Token Refresh] Tokens updated on server");
    } catch (err) {
      console.warn("[Token Refresh] Failed to update tokens on server:", err);
    }

    return data.access_token;
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

export async function zohoApiRequest(
  path: string,
  options: RequestInit = {},
  retry = true
): Promise<any> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    throw new Error("No access token found. Please reconnect your email account.");
  }

  // Create abort controller for timeout (60 seconds for slow connections)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    console.log(`[Zoho API] Requesting: ${path}`);
    const response = await fetch(`https://mail.zoho.com/api${path}`, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });

    // Auto refresh once on 401 or INVALID_TICKET
    if ((response.status === 401 || response.status === 400) && retry) {
      // Check if it's an INVALID_TICKET error
      const responseClone = response.clone();
      try {
        const errorData = await responseClone.json();
        if (errorData?.data?.errorCode === 'INVALID_TICKET') {
          console.log("Zoho token invalid (INVALID_TICKET). Refreshing...");
          try {
            await refreshToken();
            return zohoApiRequest(path, options, false);
          } catch (refreshError) {
            // Clear invalid tokens
            removeToken();
            throw new Error("Email session expired. Please reconnect your email account.");
          }
        }
      } catch {
        // Not JSON or different error, continue with normal handling
      }
    }

    // Auto refresh once on 401
    if (response.status === 401 && retry) {
      console.log("Zoho token expired. Refreshing...");
      await refreshToken();
      return zohoApiRequest(path, options, false);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Zoho API] Error ${response.status}:`, errorText);
      throw new Error(`Zoho API Error ${response.status}`);
    }

    console.log(`[Zoho API] Success: ${path}`);
    return response.json();
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.error(`[Zoho API] Timeout for: ${path}`);
      throw new Error("Zoho API request timed out. Please check your network connection and try again.");
    }
    console.error(`[Zoho API] Error for ${path}:`, error);
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}


/* ============================================================
   CENTRALIZED API CLIENT
============================================================ */

export async function serverApiRequest(
  path: string,
  options: RequestInit = {},
  retry = true
) {
  let accessToken = await getAccessToken();

  console.log("accessToken:", accessToken); // Debug log
  if (!accessToken) {
    throw new Error("No access token found");
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  // Auto refresh once
  if (response.status === 401 && retry) {
    console.log("Access token expired. Refreshing...");
    accessToken = await refreshToken();
    return serverApiRequest(path, options, false);
  }

  if (!response.ok) {
    throw new Error(`API Error ${response.status}`);
  }

  return response.json();
}
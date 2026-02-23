/* eslint-disable @typescript-eslint/no-explicit-any */

/* ============================================================
   ZOHO API CLIENT (Direct Zoho Mail API)
============================================================ */

import { BASE_URL, getAccessToken, getRefreshToken, saveAccessToken } from "./helper.js";

// Prevent multiple simultaneous refresh calls
let refreshPromise: Promise<string> | null = null;

export async function refreshToken(): Promise<string> {
  if (refreshPromise) {
    return refreshPromise; // prevent parallel refresh
  }

  refreshPromise = (async () => {
    const refreshToken = await getRefreshToken();
    if (!refreshToken) {
      throw new Error("No refresh token found");
    }

    const response = await fetch(`${BASE_URL}/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) {
      throw new Error("Refresh token failed");
    }

    const data = await response.json();
    await saveAccessToken(data.access_token);

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
    throw new Error("No access token found");
  }

  const response = await fetch(`https://mail.zoho.com/api${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  // Auto refresh once on 401
  if (response.status === 401 && retry) {
    console.log("Zoho token expired. Refreshing...");
    await refreshToken();
    return zohoApiRequest(path, options, false);
  }

  if (!response.ok) {
    throw new Error(`Zoho API Error ${response.status}`);
  }

  return response.json();
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
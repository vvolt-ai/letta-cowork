import { describe, expect, test } from "bun:test";

import { authorizeInBrowser, pkceChallenge } from "./browser-oauth.js";

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Vera browser OAuth", () => {
  test("creates the RFC 7636 S256 challenge", () => {
    expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });

  test("registers a loopback client and exchanges the callback code", async () => {
    const requests = [];
    const fetchMock = async (url, options = {}) => {
      requests.push({ url: String(url), options });
      if (String(url).endsWith("/.well-known/oauth-authorization-server")) {
        return json({
          authorization_endpoint: "https://vera.example/authorize",
          token_endpoint: "https://vera.example/token",
          registration_endpoint: "https://vera.example/register",
          revocation_endpoint: "https://vera.example/revoke",
        });
      }
      if (String(url) === "https://vera.example/register") {
        return json({ client_id: "client-1" }, 201);
      }
      if (String(url) === "https://vera.example/token") {
        return json({
          access_token: "access-token",
          refresh_token: "refresh-token",
          token_type: "Bearer",
          scope: "vera:mcp",
          expires_in: 3600,
        });
      }
      throw new Error(`Unexpected OAuth URL: ${url}`);
    };

    const auth = await authorizeInBrowser({
      serverUrl: "https://vera.example",
      fetch: fetchMock,
      openBrowser: async (authorizationUrl) => {
        const url = new URL(authorizationUrl);
        const callback = new URL(url.searchParams.get("redirect_uri"));
        callback.searchParams.set("code", "authorization-code");
        callback.searchParams.set("state", url.searchParams.get("state"));
        await fetch(callback);
      },
    });

    expect(auth).toMatchObject({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      oauthClientId: "client-1",
      scope: "vera:mcp",
    });
    const registration = JSON.parse(requests[1].options.body);
    expect(registration.redirect_uris[0]).toMatch(
      /^http:\/\/127\.0\.0\.1:\d+\/vera-oauth\/callback$/,
    );
    const tokenBody = requests[2].options.body;
    expect(tokenBody.get("code_verifier")).toBeTruthy();
    expect(tokenBody.get("client_id")).toBe("client-1");
  });
});

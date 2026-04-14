/**
 * Base HTTP Client
 * 
 * Provides low-level HTTP functionality with token management,
 * automatic token refresh, and error handling.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { execSync } from "child_process";
import { homedir } from "os";
import { dirname, join } from "path";
import type { AuthTokens, RequestOptions } from "../types.js";

// Storage path for tokens
const TOKENS_PATH = join(homedir(), ".letta-cowork", "api-tokens.json");

// Env file written so external terminal processes can source/read the token
const COWORK_ENV_PATH = join(homedir(), ".letta-cowork", "cowork.env");
const COWORK_TOKEN_PATH = join(homedir(), ".letta-cowork", ".cowork-token");

/**
 * Base HTTP Client
 * 
 * Handles token management, authentication, and HTTP requests.
 */
export class BaseHttpClient {
  protected baseUrl: string;
  protected tokens: AuthTokens | null = null;
  private refreshPromise: Promise<AuthTokens | null> | null = null;
  private _onAuthExpired: (() => void) | null = null;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || process.env.VERA_COWORK_API_URL || "https://vera-cowork-server.ngrok.app";
    this.loadTokens();
  }

  /**
   * Set callback to be called when authentication expires
   */
  set onAuthExpired(callback: (() => void) | null) {
    this._onAuthExpired = callback;
  }

  // ============================================
  // Token Management
  // ============================================

  private syncAuthEnv(): void {
    const accessToken = this.tokens?.accessToken?.trim();

    if (accessToken) {
      // 1. Set in current Electron process
      process.env.COWORK_TOKEN = accessToken;

      // 2. Write env file (sourceable by scripts/agents)
      this.writeEnvFile(accessToken);

      // 3. Persist in user shell env (~/.zshenv) so all new terminal sessions have it
      this.writeUserShellEnv(accessToken);

      // 4. macOS: set immediately via launchctl so currently open terminals also get it
      this.setLaunchctlEnv(accessToken);
      return;
    }

    // Clear all
    delete process.env.COWORK_TOKEN;
    this.writeEnvFile(null);
    this.writeUserShellEnv(null);
    this.setLaunchctlEnv(null);
  }

  private writeEnvFile(token: string | null): void {
    try {
      const dir = dirname(COWORK_ENV_PATH);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

      if (token) {
        writeFileSync(COWORK_ENV_PATH, `export COWORK_TOKEN=${token}\n`, { mode: 0o600, encoding: "utf8" });
        writeFileSync(COWORK_TOKEN_PATH, token, { mode: 0o600, encoding: "utf8" });
      } else {
        writeFileSync(COWORK_ENV_PATH, "", { mode: 0o600, encoding: "utf8" });
        writeFileSync(COWORK_TOKEN_PATH, "", { mode: 0o600, encoding: "utf8" });
      }
    } catch (err) {
      console.warn("[CoworkAuth] Failed to write env file:", err);
    }
  }

  private writeUserShellEnv(token: string | null): void {
    const MARKER_START = "# BEGIN COWORK_TOKEN (managed by Vera Cowork)";
    const MARKER_END   = "# END COWORK_TOKEN";

    // Determine shell env file: prefer ~/.zshenv (zsh default on macOS), fallback to ~/.profile
    const zshenv  = join(homedir(), ".zshenv");
    const profile = join(homedir(), ".profile");
    const envFile = process.platform === "darwin" ? zshenv : profile;

    try {
      let existing = "";
      if (existsSync(envFile)) {
        existing = readFileSync(envFile, "utf8");
      }

      // Remove any previous block
      const blockRegex = new RegExp(
        `\\n?${MARKER_START}[\\s\\S]*?${MARKER_END}\\n?`,
        "g"
      );
      let updated = existing.replace(blockRegex, "");

      // Insert new block if we have a token
      if (token) {
        const block = `\n${MARKER_START}\nexport COWORK_TOKEN=${token}\n${MARKER_END}\n`;
        updated = updated.trimEnd() + block;
      }

      writeFileSync(envFile, updated, { encoding: "utf8" });
    } catch (err) {
      console.warn("[CoworkAuth] Failed to write user shell env:", err);
    }
  }

  private setLaunchctlEnv(token: string | null): void {
    if (process.platform !== "darwin") return;
    try {
      if (token) {
        // Escape token for shell safety
        const safe = token.replace(/'/g, "'\\''");
        execSync(`launchctl setenv COWORK_TOKEN '${safe}'`, { stdio: "ignore" });
      } else {
        execSync("launchctl unsetenv COWORK_TOKEN", { stdio: "ignore" });
      }
    } catch {
      // launchctl may not be available in all macOS contexts — ignore silently
    }
  }

  private loadTokens(): void {
    try {
      if (existsSync(TOKENS_PATH)) {
        const data = readFileSync(TOKENS_PATH, "utf8");
        this.tokens = JSON.parse(data);
        this.syncAuthEnv();
      }
    } catch (error) {
      console.warn("Failed to load API tokens:", error);
      this.tokens = null;
      this.syncAuthEnv();
    }
  }

  protected saveTokens(): void {
    try {
      const dir = dirname(TOKENS_PATH);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(TOKENS_PATH, JSON.stringify(this.tokens, null, 2), "utf8");
      this.syncAuthEnv();
    } catch (error) {
      console.error("Failed to save API tokens:", error);
    }
  }

  clearTokens(): void {
    this.tokens = null;
    this.syncAuthEnv();
    try {
      if (existsSync(TOKENS_PATH)) {
        writeFileSync(TOKENS_PATH, "{}", "utf8");
      }
    } catch (error) {
      console.warn("Failed to clear token file:", error);
    }
  }

  isAuthenticated(): boolean {
    return this.tokens !== null && this.tokens.accessToken !== "";
  }

  get currentUser(): AuthTokens["user"] | null {
    return this.tokens?.user || null;
  }

  // ============================================
  // HTTP Methods
  // ============================================

  async request<T>(
    path: string,
    options: RequestOptions = {}
  ): Promise<T> {
    // Default suppressAuthExpired to true — background/IPC calls should never
    // trigger a global logout on their own. Only callers that explicitly need
    // logout-on-401 behaviour should pass suppressAuthExpired: false.
    const { method = "GET", body, requireAuth = true, suppressAuthExpired = true } = options;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (requireAuth && this.tokens?.accessToken) {
      headers["Authorization"] = `Bearer ${this.tokens.accessToken}`;
    }

    // Properly join URL parts
    const url = this.baseUrl.endsWith('/') && path.startsWith('/')
      ? `${this.baseUrl}${path.slice(1)}`
      : `${this.baseUrl}${path}`;

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    // Handle 401 - try to refresh token
    if (response.status === 401) {
      // Try to refresh if we have a refresh token
      if (this.tokens?.refreshToken) {
        const newTokens = await this.refreshAccessToken();
        if (newTokens) {
          // Retry with new token
          headers["Authorization"] = `Bearer ${newTokens.accessToken}`;
          const retryResponse = await fetch(url, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
          });
          if (!retryResponse.ok) {
            const error = await retryResponse.text();
            throw new Error(`API error: ${retryResponse.status} - ${error}`);
          }
          return retryResponse.status === 204 ? (undefined as unknown as T) : retryResponse.json();
        }
      }
      // Refresh failed or no refresh token - clear and notify
      if (!suppressAuthExpired) {
        this.clearTokens();
        this._onAuthExpired?.();
      }
      throw new Error("Authentication expired. Please login again.");
    }

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API error: ${response.status} - ${error}`);
    }

    // 204 No Content — return undefined (e.g. DELETE responses)
    if (response.status === 204) return undefined as unknown as T;

    return response.json();
  }

  private async refreshAccessToken(): Promise<AuthTokens | null> {
    // Prevent concurrent refresh
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.doRefreshToken();
    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async doRefreshToken(): Promise<AuthTokens | null> {
    if (!this.tokens?.refreshToken) {
      return null;
    }

    try {
      const response = await fetch(`${this.baseUrl}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: this.tokens.refreshToken }),
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      this.tokens = {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken || this.tokens.refreshToken,
        expiresIn: data.expiresIn,
        user: data.user,
      };
      this.syncAuthEnv();
      this.saveTokens();
      return this.tokens;
    } catch (error) {
      console.error("Failed to refresh token:", error);
      return null;
    }
  }
}

/**
 * Express Server Configuration
 * Server port configuration and middleware setup
 */

import { OAUTH_PORT } from "../helper.js";

/**
 * Server configuration constants
 */
export const SERVER_CONFIG = {
  port: OAUTH_PORT,
  baseUrl: `http://localhost:${OAUTH_PORT}`,
} as const;

/**
 * Get the server port
 */
export function getServerPort(): number {
  return SERVER_CONFIG.port;
}

/**
 * Get the server base URL
 */
export function getServerBaseUrl(): string {
  return SERVER_CONFIG.baseUrl;
}

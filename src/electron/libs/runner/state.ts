/**
 * Active sessions tracking, abort controllers, and agent cache.
 */

import type { Session as LettaSession } from "@letta-ai/letta-code-sdk";
import { debug } from "./logger.js";

/**
 * Track all active sessions for abort handling.
 */
const activeSessions = new Map<string, LettaSession>();

/**
 * Store active Letta session for abort handling.
 */
let activeLettaSession: LettaSession | null = null;

/**
 * Store the current abort controller for external access.
 */
let currentAbortController: AbortController | null = null;

/**
 * Store agentId for reuse across conversations.
 */
let cachedAgentId: string | null = null;

/**
 * Default working directory.
 */
export const DEFAULT_CWD = process.cwd();

/**
 * Get the active sessions map.
 */
export function getActiveSessions(): Map<string, LettaSession> {
  return activeSessions;
}

/**
 * Store a session in the active sessions map.
 */
export function storeSession(key: string, session: LettaSession): void {
  activeSessions.set(key, session);
  activeLettaSession = session;
  debug("session stored in activeSessions for abort handling", { sessionKey: key });
}

/**
 * Remove a session from the active sessions map.
 */
export function removeSession(key: string): void {
  activeSessions.delete(key);
}

/**
 * Get a session by key.
 */
export function getSession(key: string): LettaSession | undefined {
  return activeSessions.get(key);
}

/**
 * Get the active Letta session.
 */
export function getActiveLettaSession(): LettaSession | null {
  return activeLettaSession;
}

/**
 * Set the active Letta session.
 */
export function setActiveLettaSession(session: LettaSession | null): void {
  activeLettaSession = session;
}

/**
 * Get the current abort controller.
 */
export function getCurrentAbortController(): AbortController | null {
  return currentAbortController;
}

/**
 * Set the current abort controller.
 */
export function setCurrentAbortController(controller: AbortController | null): void {
  currentAbortController = controller;
}

/**
 * Get the cached agent ID.
 */
export function getCachedAgentId(): string | null {
  return cachedAgentId;
}

/**
 * Set the cached agent ID.
 */
export function setCachedAgentId(agentId: string | null): void {
  cachedAgentId = agentId;
}

/**
 * Get the current agent ID from active session or cache.
 */
export function getCurrentAgentId(): string | null {
  return activeLettaSession?.agentId ?? cachedAgentId;
}

/**
 * Clear the agent cache (call when starting a new session with a different agent).
 */
export function clearAgentCache(): void {
  cachedAgentId = null;
  debug("agent cache cleared (name cache preserved)");
}

/**
 * Clear all active sessions.
 */
export function clearActiveSessions(): void {
  activeSessions.clear();
}

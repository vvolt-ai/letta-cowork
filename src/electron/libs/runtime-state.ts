/**
 * Simple in-memory runtime state for active sessions.
 * No persistence needed - Letta handles conversation/message storage.
 */

import type { CanUseToolResponse } from "../types.js";

export type PendingPermission = {
  toolUseId: string;
  toolName: string;
  input: unknown;
  resolve: (result: CanUseToolResponse) => void;
};

export type SessionPermissionGrants = {
  allowAll: boolean;
  allowedTools: Set<string>;
};

export function createSessionPermissionGrants(): SessionPermissionGrants {
  return {
    allowAll: false,
    allowedTools: new Set(),
  };
}

export type SessionStatus = "idle" | "running" | "completed" | "error";

export type RuntimeSession = {
  conversationId: string;
  agentId?: string;
  title?: string;
  status: SessionStatus;
  pendingPermissions: Map<string, PendingPermission>;
  permissionGrants: SessionPermissionGrants;
  abortController?: AbortController;
};

// In-memory state for active sessions
const sessions = new Map<string, RuntimeSession>();

export function createRuntimeSession(
  conversationId: string,
  pendingPermissions: Map<string, PendingPermission> = new Map(),
  permissionGrants: SessionPermissionGrants = createSessionPermissionGrants()
): RuntimeSession {
  const session: RuntimeSession = {
    conversationId,
    status: "idle",
    pendingPermissions,
    permissionGrants,
  };
  sessions.set(conversationId, session);
  return session;
}

export function getSession(conversationId: string): RuntimeSession | undefined {
  return sessions.get(conversationId);
}

export type PermissionGrantScope = "once" | "tool" | "session";

export function resolveSessionPermission(
  session: RuntimeSession,
  toolUseId: string,
  result: CanUseToolResponse,
  scope: PermissionGrantScope = "once"
): boolean {
  const pending = session.pendingPermissions.get(toolUseId);
  if (!pending) return false;

  const isAllowed = result.behavior === "allow";
  if (!isAllowed || scope === "once" || pending.toolName === "AskUserQuestion") {
    pending.resolve(result);
    return true;
  }

  if (scope === "session") {
    session.permissionGrants.allowAll = true;
    // Release requests already waiting in parallel as well as future calls.
    for (const request of [...session.pendingPermissions.values()]) {
      if (request.toolName !== "AskUserQuestion") {
        request.resolve({ behavior: "allow" });
      }
    }
    return true;
  }

  session.permissionGrants.allowedTools.add(pending.toolName);
  // Apply the grant to duplicate requests that arrived in the same batch.
  for (const request of [...session.pendingPermissions.values()]) {
    if (request.toolName === pending.toolName) {
      request.resolve({ behavior: "allow" });
    }
  }
  return true;
}

export function updateSession(conversationId: string, updates: Partial<RuntimeSession>): RuntimeSession | undefined {
  const session = sessions.get(conversationId);
  if (!session) return undefined;
  Object.assign(session, updates);
  return session;
}

export function deleteSession(conversationId: string): boolean {
  return sessions.delete(conversationId);
}

export function getAllSessions(): Map<string, RuntimeSession> {
  return sessions;
}

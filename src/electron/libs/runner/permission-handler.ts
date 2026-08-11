/**
 * Tool permission handling for the runner.
 */

import type { RunnerSession } from "./types.js";
import type { CanUseToolResponse } from "@letta-ai/letta-agent-sdk";

/**
 * Send a permission request event.
 */
export type SendPermissionRequest = (toolUseId: string, toolName: string, input: unknown) => void;

const READ_ONLY_TOOLS = new Set([
  "Read", "ReadLSP", "Glob", "Grep", "LS", "ViewImage", "LogTail", "LogSearch",
  "CodeSearch", "CodeGetDefinition", "CodeFindReferences", "CodeFileOutline", "TestFindRelated",
  "ProjectContext", "ProjectDetect", "ProjectMap", "ProjectMemoryStatus", "ProjectMemoryRead", "ProjectMemorySearch",
  "GitDiffSummary", "GitChangedByAgent", "LiveDiffStatus", "ToolTraceSearch", "RunTimeline", "TaskGet", "TaskList", "TaskOutput",
  "BrowserSnapshot", "BrowserConsoleMessages", "BrowserNetworkRequests",
  "odoo_search", "odoo_count", "odoo_group", "odoo_get_models", "odoo_get_fields", "odoo_health_check_health_odoo_get",
]);

const EDIT_TOOLS = new Set([
  "Edit", "MultiEdit", "Write", "ApplyPatch",
  "CodeEdit", "CodeApplyPatch", "CodeFormatFiles", "CodeOrganizeImports",
  "ProjectMemoryBootstrap", "ProjectMemoryWrite", "LiveApplyPatch",
]);

function isReadOnlyRequest(toolName: string, input: unknown): boolean {
  if (READ_ONLY_TOOLS.has(toolName)) return true;
  if (toolName === "Git" && input && typeof input === "object") {
    const operation = (input as { operation?: unknown }).operation;
    return operation === "status" || operation === "diff" || operation === "log" || operation === "branch";
  }
  if (toolName === "MemoryNotes" && input && typeof input === "object") {
    const action = (input as { action?: unknown }).action;
    return action === "list" || action === "search";
  }
  if (toolName === "UserPreferences" && input && typeof input === "object") {
    return (input as { action?: unknown }).action === "get";
  }
  if (toolName === "Reminders" && input && typeof input === "object") {
    return (input as { action?: unknown }).action === "list";
  }
  return false;
}

/**
 * Create a canUseTool handler for a session.
 */
export function createCanUseToolHandler(
  session: RunnerSession,
  sendPermissionRequest: SendPermissionRequest,
  permissionMode: "standard" | "acceptEdits" | "unrestricted" | "strict" = "unrestricted"
): (toolName: string, input: unknown) => Promise<CanUseToolResponse> {
  return async (toolName: string, input: unknown): Promise<CanUseToolResponse> => {
    // AskUserQuestion needs an actual human answer, so it can never inherit an
    // automatic session grant. Every other tool may be granted for this session.
    const isGrantedForSession = toolName !== "AskUserQuestion"
      && Boolean(
        session.permissionGrants?.allowAll
        || session.permissionGrants?.allowedTools.has(toolName)
      );
    const requiresPrompt = !isGrantedForSession && (
      permissionMode === "strict"
      || toolName === "AskUserQuestion"
      || (permissionMode === "standard" && !isReadOnlyRequest(toolName, input))
      || (permissionMode === "acceptEdits" && !isReadOnlyRequest(toolName, input) && !EDIT_TOOLS.has(toolName))
    );

    if (!requiresPrompt) {
      return { behavior: "allow" as const };
    }

    const toolUseId = crypto.randomUUID();
    const decision = new Promise<CanUseToolResponse>((resolve) => {
      session.pendingPermissions.set(toolUseId, {
        toolUseId,
        toolName,
        input,
        resolve: (result) => {
          session.pendingPermissions.delete(toolUseId);
          resolve(result);
        }
      });
    });

    // Register the resolver before notifying the renderer. This closes the race
    // where a fast permission response arrives before pendingPermissions is ready.
    sendPermissionRequest(toolUseId, toolName, input);
    return decision;
  };
}

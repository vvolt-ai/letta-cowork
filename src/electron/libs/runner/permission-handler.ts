/**
 * Tool permission handling for the runner.
 */

import type { CanUseToolResponse } from "@letta-ai/letta-code-sdk";
import type { PendingPermission } from "../runtime-state.js";
import type { RunnerSession } from "./types.js";

/**
 * Send a permission request event.
 */
export type SendPermissionRequest = (toolUseId: string, toolName: string, input: unknown) => void;

/**
 * Create a canUseTool handler for a session.
 */
export function createCanUseToolHandler(
  session: RunnerSession,
  sendPermissionRequest: SendPermissionRequest
): (toolName: string, input: unknown) => Promise<CanUseToolResponse> {
  return async (toolName: string, input: unknown): Promise<CanUseToolResponse> => {
    // For AskUserQuestion, we need to wait for user response
    if (toolName === "AskUserQuestion") {
      const toolUseId = crypto.randomUUID();
      sendPermissionRequest(toolUseId, toolName, input);
      return new Promise<CanUseToolResponse>((resolve) => {
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
    }
    return { behavior: "allow" as const };
  };
}

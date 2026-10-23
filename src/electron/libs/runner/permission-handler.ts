/**
 * Tool permission handling for the runner.
 */

import type { RunnerSession } from './types.js';
import type { CanUseToolResponse } from '@letta-ai/letta-agent-sdk';

/**
 * Send a permission request event.
 */
export type SendPermissionRequest = (toolUseId: string, toolName: string, input: unknown) => void;

const READ_ONLY_TOOLS = new Set([
  'Read',
  'ReadLSP',
  'Glob',
  'Grep',
  'LS',
  'ViewImage',
  'LogTail',
  'LogSearch',
  'CodeSearch',
  'CodeGetDefinition',
  'CodeFindReferences',
  'CodeFileOutline',
  'TestFindRelated',
  'ProjectContext',
  'ProjectDetect',
  'ProjectMap',
  'ProjectMemoryStatus',
  'ProjectMemoryRead',
  'ProjectMemorySearch',
  'GitDiffSummary',
  'GitChangedByAgent',
  'LiveDiffStatus',
  'ToolTraceSearch',
  'RunTimeline',
  'TaskGet',
  'TaskList',
  'TaskOutput',
  'BrowserSnapshot',
  'BrowserConsoleMessages',
  'BrowserNetworkRequests',
  'odoo_search',
  'odoo_count',
  'odoo_group',
  'odoo_get_models',
  'odoo_get_fields',
  'odoo_health_check_health_odoo_get',
]);

const EDIT_TOOLS = new Set([
  'Edit',
  'MultiEdit',
  'Write',
  'ApplyPatch',
  'CodeEdit',
  'CodeApplyPatch',
  'CodeFormatFiles',
  'CodeOrganizeImports',
  'ProjectMemoryBootstrap',
  'ProjectMemoryWrite',
  'LiveApplyPatch',
]);

function isReadOnlyRequest(toolName: string, input: unknown): boolean {
  if (READ_ONLY_TOOLS.has(toolName)) return true;
  if (toolName === 'AgentMemory' && input && typeof input === 'object')
    return ['status', 'list', 'read', 'search'].includes(
      String((input as { action?: unknown }).action),
    );
  if (toolName === 'Git' && input && typeof input === 'object') {
    const operation = (input as { operation?: unknown }).operation;
    return (
      operation === 'status' ||
      operation === 'diff' ||
      operation === 'log' ||
      operation === 'branch'
    );
  }
  if (toolName === 'MemoryNotes' && input && typeof input === 'object') {
    const action = (input as { action?: unknown }).action;
    return action === 'list' || action === 'search';
  }
  if (toolName === 'UserPreferences' && input && typeof input === 'object') {
    return (input as { action?: unknown }).action === 'get';
  }
  if (toolName === 'Reminders' && input && typeof input === 'object') {
    return (input as { action?: unknown }).action === 'list';
  }
  return false;
}

/**
 * Create a canUseTool handler for a session.
 */
export function createCanUseToolHandler(
  session: RunnerSession,
  sendPermissionRequest: SendPermissionRequest,
  permissionMode: 'standard' | 'acceptEdits' | 'unrestricted' | 'strict' = 'unrestricted',
  onCancelled?: (toolUseId: string) => void,
): (toolName: string, input: unknown, signal?: AbortSignal) => Promise<CanUseToolResponse> {
  return async (
    toolName: string,
    input: unknown,
    signal?: AbortSignal,
  ): Promise<CanUseToolResponse> => {
    if (signal?.aborted) return { behavior: 'deny', message: 'Cancelled.' };
    // AskUserQuestion needs an actual human answer, so it can never inherit an
    // automatic session grant. Every other tool may be granted for this session.
    const isGrantedForSession =
      toolName !== 'AskUserQuestion' &&
      Boolean(
        session.permissionGrants?.allowAll || session.permissionGrants?.allowedTools.has(toolName),
      );
    const requiresPrompt =
      !isGrantedForSession &&
      (permissionMode === 'strict' ||
        toolName === 'AskUserQuestion' ||
        (permissionMode === 'standard' && !isReadOnlyRequest(toolName, input)) ||
        (permissionMode === 'acceptEdits' &&
          !isReadOnlyRequest(toolName, input) &&
          !EDIT_TOOLS.has(toolName)));

    if (!requiresPrompt) {
      return { behavior: 'allow' as const };
    }

    const toolUseId = crypto.randomUUID();
    return new Promise<CanUseToolResponse>((resolve) => {
      let settled = false;
      const finish = (result: CanUseToolResponse) => {
        if (settled) return;
        settled = true;
        session.pendingPermissions.delete(toolUseId);
        signal?.removeEventListener('abort', cancel);
        resolve(result);
      };
      const cancel = () => {
        finish({ behavior: 'deny', message: 'Cancelled.' });
        try {
          onCancelled?.(toolUseId);
        } catch {
          /* A closed renderer cannot revive approval. */
        }
      };
      session.pendingPermissions.set(toolUseId, { toolUseId, toolName, input, resolve: finish });
      signal?.addEventListener('abort', cancel, { once: true });
      if (signal?.aborted) {
        cancel();
        return;
      }
      // Register before notification; a fast UI answer cannot miss its resolver.
      try {
        sendPermissionRequest(toolUseId, toolName, input);
      } catch {
        cancel();
      }
    });
  };
}

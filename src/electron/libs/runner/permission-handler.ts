/** Cowork's user approval policy, separate from SDK transport permissions. */
import {
  ODOO_ATTACHMENT_TOOL,
  recordAttachmentApproval,
} from '../../services/client-tools/runners/_shared/attachmentApproval.js';
import type { RunnerSession } from './types.js';
import type { CanUseToolResponse } from '@letta-ai/letta-agent-sdk';

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
  if (!input || typeof input !== 'object') return false;
  const args = input as Record<string, unknown>;
  if (toolName === 'AgentMemory')
    return ['status', 'list', 'read', 'search'].includes(String(args.action));
  if (toolName === 'Git')
    return ['status', 'diff', 'log', 'branch'].includes(String(args.operation));
  if (toolName === 'MemoryNotes') return args.action === 'list' || args.action === 'search';
  if (toolName === 'UserPreferences') return args.action === 'get';
  if (toolName === 'Reminders') return args.action === 'list';
  return false;
}
export function createCanUseToolHandler(
  session: RunnerSession,
  sendPermissionRequest: SendPermissionRequest,
  permissionMode: 'standard' | 'acceptEdits' | 'unrestricted' | 'strict' = 'unrestricted',
  onCancelled?: (toolUseId: string) => void,
): (toolName: string, input: unknown, signal?: AbortSignal) => Promise<CanUseToolResponse> {
  return async (toolName, input, signal) => {
    if (signal?.aborted) return { behavior: 'deny', message: 'Cancelled.' };
    // Neither Full Access nor prior grants authorize a question answer or an
    // original-attachment business write. Both need a fresh exact human reply.
    const alwaysHuman = toolName === 'AskUserQuestion' || toolName === ODOO_ATTACHMENT_TOOL;
    const granted =
      !alwaysHuman &&
      Boolean(
        session.permissionGrants?.allowAll || session.permissionGrants?.allowedTools.has(toolName),
      );
    const requiresPrompt =
      !granted &&
      (permissionMode === 'strict' ||
        alwaysHuman ||
        (permissionMode === 'standard' && !isReadOnlyRequest(toolName, input)) ||
        (permissionMode === 'acceptEdits' &&
          !isReadOnlyRequest(toolName, input) &&
          !EDIT_TOOLS.has(toolName)));
    if (!requiresPrompt) return { behavior: 'allow' };
    const toolUseId = crypto.randomUUID();
    return new Promise<CanUseToolResponse>((resolve) => {
      let settled = false;
      const finish = (result: CanUseToolResponse) => {
        if (settled) return;
        settled = true;
        session.pendingPermissions.delete(toolUseId);
        signal?.removeEventListener('abort', cancel);
        if (toolName === ODOO_ATTACHMENT_TOOL) recordAttachmentApproval(result, input);
        resolve(result);
      };
      const cancel = () => {
        if (settled) return;
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
      try {
        sendPermissionRequest(toolUseId, toolName, input);
      } catch {
        cancel();
      }
    });
  };
}

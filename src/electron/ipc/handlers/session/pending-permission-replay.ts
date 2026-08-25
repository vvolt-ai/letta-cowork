import type { PendingPermission } from "../../../libs/runtime-state.js";

export interface PendingPermissionReplayRequest {
  toolUseId: string;
  toolName: string;
  input: unknown;
}

/** Create reconnect-safe UI payloads without resolving or mutating live requests. */
export function snapshotPendingPermissionRequests(
  requests: Iterable<PendingPermission>,
): PendingPermissionReplayRequest[] {
  return Array.from(requests).map((request) => ({
    toolUseId: request.toolUseId,
    toolName: request.toolName,
    input: request.input,
  }));
}

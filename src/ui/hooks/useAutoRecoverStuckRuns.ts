import { useEffect, useRef } from "react";
import type { SessionStatus } from "../types";

/**
 * Auto-recovery for orphaned tool approvals.
 *
 * When a session finishes and its runner is torn down, the in-memory
 * `pendingPermissions` Map on the electron side is lost. If Letta's run
 * was paused waiting for an approval decision at the moment the runner
 * died, the run becomes "stuck": the server keeps waiting, our runner is
 * gone, and any approval the user clicks would silently fail (the
 * Promise resolver doesn't exist anymore).
 *
 * This hook watches the active session's status. As soon as it
 * transitions to a terminal state (completed / idle / error), we ask the
 * electron side to query Letta for stuck runs on this session+agent and
 * auto-approve them so the conversation is unblocked for the next turn.
 *
 * The recovery endpoint (`recoverPendingApprovals`) is idempotent: if
 * nothing is stuck, it returns an empty list and is effectively a no-op.
 * Debouncing by `delayMs` gives any in-flight cleanup events a chance to
 * settle before we probe the server.
 */
export function useAutoRecoverStuckRuns(params: {
  sessionId: string | null;
  status: SessionStatus | undefined;
  agentId: string | undefined;
  delayMs?: number;
  enabled?: boolean;
}) {
  const { sessionId, status, agentId, delayMs = 1500, enabled = true } = params;

  // Track the last (sessionId, status) pair we fired recovery for so we
  // don't re-fire on every re-render.
  const lastFiredRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (!sessionId) return;
    if (!status) return;

    // Only run on terminal states.
    if (status !== "completed" && status !== "idle" && status !== "error") {
      return;
    }

    const key = `${sessionId}:${status}`;
    if (lastFiredRef.current === key) return;
    lastFiredRef.current = key;

    const timer = window.setTimeout(async () => {
      try {
        const recovered = await window.electron.recoverPendingApprovals(
          sessionId,
          agentId,
        );
        if (Array.isArray(recovered) && recovered.length > 0) {
          console.log(
            `[auto-recover] Resolved ${recovered.length} stuck run(s) on session ${sessionId}`,
            recovered.map((r) => ({ runId: r.runId, tool: r.toolName })),
          );
        }
      } catch (error) {
        console.warn(
          `[auto-recover] Recovery probe failed for session ${sessionId}:`,
          error,
        );
      }
    }, delayMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [enabled, sessionId, status, agentId, delayMs]);

  // Reset the "last fired" guard when the session changes so switching
  // back to a session that went terminal earlier can re-probe.
  useEffect(() => {
    lastFiredRef.current = null;
  }, [sessionId]);
}

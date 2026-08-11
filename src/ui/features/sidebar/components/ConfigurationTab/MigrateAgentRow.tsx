/**
 * MigrateAgentRow — one-click button to migrate the active session's
 * agent to a new letta_v1_agent so it natively supports runtime
 * client_tools (Bash, Skill, file ops, etc.).
 *
 * UX:
 *   • disabled if no active agent on the session
 *   • shows progress, success summary, or error inline
 *   • after success the user must switch to the new agent in the sidebar
 */

import { memo, useState } from "react";

import { useAppStore } from "../../../../store/useAppStore";

interface MigrationResult {
    sourceAgentId: string;
    newAgentId: string;
    newAgentName: string;
    blocksCopied: number;
    skippedBlocks: Array<{ label: string; reason: string }>;
}

type Status =
    | { kind: "idle" }
    | { kind: "running" }
    | { kind: "success"; data: MigrationResult }
    | { kind: "error"; message: string };

export const MigrateAgentRow = memo(function MigrateAgentRow() {
    const activeSessionId = useAppStore((s) => s.activeSessionId);
    const sessions = useAppStore((s) => s.sessions);
    const activeSession =
        activeSessionId ? sessions[activeSessionId] : undefined;
    const sourceAgentId = activeSession?.agentId ?? null;
    const sourceAgentName = activeSession?.agentName ?? null;

    const [status, setStatus] = useState<Status>({ kind: "idle" });

    async function handleMigrate() {
        if (!sourceAgentId) return;
        setStatus({ kind: "running" });
        try {
            const r = await window.electron.lettaMigrateAgent({
                sourceAgentId,
            });
            if (r.ok) {
                setStatus({ kind: "success", data: r.data });
            } else {
                setStatus({ kind: "error", message: r.error });
            }
        } catch (err) {
            setStatus({
                kind: "error",
                message: err instanceof Error ? err.message : String(err),
            });
        }
    }

    function copyToClipboard(text: string): void {
        try {
            void navigator.clipboard.writeText(text);
        } catch {
            // no-op
        }
    }

    return (
        <div className="rounded-xl border border-[var(--color-border)] bg-white p-4">
            <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                    <svg
                        viewBox="0 0 24 24"
                        className="h-5 w-5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                    >
                        <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                        <path d="M12 8v4l3 2" />
                    </svg>
                </span>
                <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-medium text-ink-900">
                        Enable local tools (Bash, Skill, file ops)
                    </div>
                    <div className="mt-0.5 text-[12px] text-muted leading-snug">
                        Older agent types can't call client-side tools at
                        runtime. Click to clone the active agent into a new{" "}
                        <code className="rounded bg-gray-100 px-1 py-px text-[11px]">
                            letta_v1_agent
                        </code>{" "}
                        with the same memory blocks. After migration, switch
                        to the new agent in the sidebar.
                    </div>
                    {sourceAgentId ? (
                        <div className="mt-2 text-[11px] text-muted font-mono break-all">
                            Source: {sourceAgentName ?? "(unnamed)"} —{" "}
                            {sourceAgentId}
                        </div>
                    ) : (
                        <div className="mt-2 text-[11px] text-amber-600">
                            No active session yet — start or pick a chat
                            session first, then come back here.
                        </div>
                    )}
                </div>
            </div>

            <div className="mt-3 flex items-center gap-2">
                <button
                    type="button"
                    onClick={handleMigrate}
                    disabled={!sourceAgentId || status.kind === "running"}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    {status.kind === "running" ? "Migrating…" : "Migrate"}
                </button>
                {status.kind === "running" && (
                    <span className="text-[11px] text-muted">
                        Copying memory blocks — usually 2–10 seconds…
                    </span>
                )}
            </div>

            {status.kind === "success" && (
                <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-[12px] text-emerald-900">
                    <div className="font-medium">Migration succeeded.</div>
                    <div className="mt-1 leading-snug">
                        New agent: <strong>{status.data.newAgentName}</strong>
                    </div>
                    <div className="mt-1 flex items-center gap-1 font-mono text-[11px] break-all">
                        {status.data.newAgentId}
                        <button
                            type="button"
                            onClick={() => copyToClipboard(status.data.newAgentId)}
                            className="rounded px-1.5 py-0.5 text-emerald-700 hover:bg-emerald-100"
                            title="Copy agent id"
                        >
                            copy
                        </button>
                    </div>
                    <div className="mt-1">
                        Memory blocks copied: {status.data.blocksCopied}
                    </div>
                    <div className="mt-2 text-emerald-800">
                        Next: switch to <strong>{status.data.newAgentName}</strong>{" "}
                        in the sidebar agent list, start a fresh conversation,
                        and try a Bash command. The old agent stays available;
                        it's not deleted.
                    </div>
                </div>
            )}

            {status.kind === "error" && (
                <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-[12px] text-rose-900">
                    <div className="font-medium">Migration failed.</div>
                    <div className="mt-1 break-all font-mono text-[11px]">
                        {status.message}
                    </div>
                </div>
            )}
        </div>
    );
});

/**
 * PlanModePanel — surfaces per-session plan-mode state.
 *
 * Two pieces:
 *   1. Banner shown whenever the active session is in plan mode. Tells
 *      the user the agent is restricted to read-only tools.
 *   2. Plan viewer modal that opens automatically whenever a new plan
 *      body lands (i.e. ExitPlanMode just fired). Closeable by the user.
 *
 * State source is `SessionView.planMode / planFilePath / planBody /
 * planUpdatedAt` in useAppStore, populated by the
 * `plan_mode_state` / `plan_mode_plan` server events.
 */

import { memo, useEffect, useState } from "react";
import { useAppStore } from "../../../store/useAppStore";

interface PlanModePanelProps {
    sessionId: string | null;
}

export const PlanModePanel = memo(function PlanModePanel({ sessionId }: PlanModePanelProps) {
    const session = useAppStore((state) =>
        sessionId ? state.sessions[sessionId] : undefined
    );
    const [viewerOpen, setViewerOpen] = useState(false);
    const [lastSeenUpdate, setLastSeenUpdate] = useState<number | null>(null);

    // Auto-open the viewer when a new plan body arrives.
    useEffect(() => {
        const updatedAt = session?.planUpdatedAt;
        if (
            updatedAt &&
            session?.planBody &&
            updatedAt !== lastSeenUpdate
        ) {
            setViewerOpen(true);
            setLastSeenUpdate(updatedAt);
        }
    }, [session?.planUpdatedAt, session?.planBody, lastSeenUpdate]);

    if (!session) return null;
    const inPlanMode = session.planMode === "plan";
    const hasPlanBody = Boolean(session.planBody);

    if (!inPlanMode && !hasPlanBody) return null;

    return (
        <>
            {inPlanMode ? (
                <div
                    role="status"
                    aria-live="polite"
                    style={{
                        padding: "8px 12px",
                        background: "#fff7e6",
                        borderBottom: "1px solid #ffd591",
                        color: "#7a4b00",
                        fontSize: 13,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                    }}
                >
                    <span>
                        <strong>📝 Plan mode active.</strong>{" "}
                        The agent is restricted to read-only tools.
                        Writes, edits and shell commands are blocked
                        until <code>ExitPlanMode</code> is called.
                    </span>
                    {hasPlanBody && (
                        <button
                            type="button"
                            onClick={() => setViewerOpen(true)}
                            style={{
                                fontSize: 12,
                                padding: "2px 8px",
                                background: "#fff",
                                border: "1px solid #ffd591",
                                borderRadius: 4,
                                cursor: "pointer",
                                color: "#7a4b00",
                            }}
                        >
                            Show plan
                        </button>
                    )}
                </div>
            ) : null}

            {viewerOpen && session.planBody ? (
                <PlanViewerModal
                    title="Proposed plan"
                    body={session.planBody}
                    planFilePath={session.planFilePath ?? null}
                    onClose={() => setViewerOpen(false)}
                />
            ) : null}
        </>
    );
});

interface PlanViewerModalProps {
    title: string;
    body: string;
    planFilePath: string | null;
    onClose: () => void;
}

function PlanViewerModal({
    title,
    body,
    planFilePath,
    onClose,
}: PlanViewerModalProps) {
    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onClick={onClose}
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.45)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: "#fff",
                    width: "min(720px, 92vw)",
                    maxHeight: "82vh",
                    borderRadius: 8,
                    boxShadow: "0 10px 40px rgba(0,0,0,0.25)",
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                }}
            >
                <header
                    style={{
                        padding: "12px 16px",
                        borderBottom: "1px solid #e5e7eb",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        background: "#f9fafb",
                    }}
                >
                    <div>
                        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>
                            {title}
                        </h2>
                        {planFilePath ? (
                            <div
                                style={{
                                    fontSize: 11,
                                    color: "#6b7280",
                                    marginTop: 2,
                                    fontFamily: "monospace",
                                }}
                            >
                                {planFilePath}
                            </div>
                        ) : null}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close plan viewer"
                        style={{
                            fontSize: 18,
                            lineHeight: 1,
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            color: "#6b7280",
                            padding: 4,
                        }}
                    >
                        ✕
                    </button>
                </header>
                <pre
                    style={{
                        margin: 0,
                        padding: 16,
                        overflow: "auto",
                        flex: 1,
                        fontSize: 13,
                        lineHeight: 1.5,
                        fontFamily:
                            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        background: "#fafafa",
                    }}
                >
                    {body}
                </pre>
            </div>
        </div>
    );
}

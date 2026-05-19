/**
 * Plan-mode manager — per-session permission state.
 *
 * Ported (simplified) from letta-code's src/permissions/mode.ts.
 * Differences from upstream:
 *   • No globalThis singleton — state is per-WsSession (vera-server is multi-tenant).
 *   • Only two modes: 'plan' and 'unrestricted'. We don't ship standard/acceptEdits/memory.
 *   • Plan-write detection is allow-by-suffix (.md inside the plan dir) — no heredoc parsing.
 *
 * State semantics:
 *   • setMode('plan')   → remembers previous mode, assigns a plan file path
 *   • setMode('unrestricted') after plan → restores previous mode, clears plan file
 *
 * The mode manager does NOT auto-approve tools — it produces a decision
 * that ws-session.ts consults during the approval loop.
 */

import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

export type PermissionMode = "plan" | "unrestricted";

export interface ModeOverrideResult {
    decision: "allow" | "deny";
    reason?: string;
}

/** Tools that are read-only and always allowed in plan mode. */
const PLAN_MODE_ALLOWED_TOOLS: ReadonlySet<string> = new Set([
    "Read",
    "Glob",
    "Grep",
    "LS",
    "TodoWrite",
    "ViewImage",
    "ReadLSP",
    "ExitPlanMode",
    "AskUserQuestion",
    "TaskOutput",
    "BashOutput",
    "Skill",
    "list_skills",
    "UpdatePlan",
]);

/** Tools that can WRITE — only allowed in plan mode when targeting the plan file. */
const PLAN_MODE_WRITE_TOOLS: ReadonlySet<string> = new Set([
    "Write",
    "Edit",
    "MultiEdit",
    "ApplyPatch",
]);

/** Tools that run shell commands — allowed in plan mode only if read-only. */
const PLAN_MODE_SHELL_TOOLS: ReadonlySet<string> = new Set(["Bash"]);

/** Read-only shell command prefixes (best-effort heuristic). */
const READ_ONLY_SHELL_PREFIXES: ReadonlyArray<RegExp> = [
    /^\s*(?:cd\s+\S+\s*&&\s*)?(?:ls|cat|head|tail|grep|rg|find|wc|file|stat|du|df|pwd|env|whoami|which|type|echo|printf)\b/,
    /^\s*git\s+(?:status|log|diff|show|branch|tag|remote(?:\s+-v|\s+show)?|rev-parse|describe|blame|ls-files|config\s+--get|config\s+--list|reflog)\b/,
    /^\s*node\s+--version\b/,
    /^\s*npm\s+(?:list|ls|root|prefix|view|outdated|outdated\s+--depth=0|--version|-v)\b/,
    /^\s*npx\s+--version\b/,
    /^\s*tsc\s+(?:--version|-v|--noEmit|--noEmit\s.*)\s*$/,
];

function isReadOnlyShellCommand(command: string): boolean {
    if (!command || typeof command !== "string") return false;
    return READ_ONLY_SHELL_PREFIXES.some((rx) => rx.test(command));
}

function isWithinDir(filePath: string, dir: string): boolean {
    const rel = relative(dir, resolve(filePath));
    return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

/**
 * Compute the plan file path for a conversation. Plans live under
 * `~/.letta/plans/<conversationId>/<short-name>.md`. The conversationId
 * makes plans scoped to a session; we don't reuse plan files across.
 */
export function buildPlanFilePath(conversationId: string, slug?: string): string {
    const safeSlug = (slug || "plan").replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 40);
    const safeConv = conversationId.replace(/[^a-zA-Z0-9_-]/g, "-");
    return join(homedir(), ".letta", "plans", safeConv, `${safeSlug}.md`);
}

/** Plans directory (parent of all plan files). */
export function plansDir(): string {
    return join(homedir(), ".letta", "plans");
}

export class PlanModeManager {
    private currentMode: PermissionMode = "unrestricted";
    private modeBeforePlan: PermissionMode | null = null;
    private planFilePath: string | null = null;
    /** Optional listeners — fired whenever mode changes. UI/channel adapters use this. */
    private listeners: Set<(state: { mode: PermissionMode; planFilePath: string | null }) => void> =
        new Set();

    /** Get the current mode. */
    getMode(): PermissionMode {
        return this.currentMode;
    }

    /** Get the plan file path (null when not in plan mode). */
    getPlanFilePath(): string | null {
        return this.planFilePath;
    }

    /** Get the mode we were in before entering plan mode (for restoration). */
    getModeBeforePlan(): PermissionMode | null {
        return this.modeBeforePlan;
    }

    /** Subscribe to mode changes. Returns an unsubscribe function. */
    onChange(
        fn: (state: { mode: PermissionMode; planFilePath: string | null }) => void,
    ): () => void {
        this.listeners.add(fn);
        return () => {
            this.listeners.delete(fn);
        };
    }

    private emit(): void {
        for (const fn of this.listeners) {
            try {
                fn({ mode: this.currentMode, planFilePath: this.planFilePath });
            } catch {
                // Listener errors must not break mode transitions.
            }
        }
    }

    /**
     * Enter plan mode. Stores the previous mode for restoration on exit,
     * and assigns a plan file path. The caller is responsible for ensuring
     * the plan file's parent directory exists (`ensurePlanDir` helper below).
     */
    async enterPlanMode(conversationId: string, slug?: string): Promise<string> {
        if (this.currentMode !== "plan") {
            this.modeBeforePlan = this.currentMode;
        }
        this.currentMode = "plan";
        this.planFilePath = buildPlanFilePath(conversationId, slug);
        await ensurePlanDir(this.planFilePath);
        this.emit();
        return this.planFilePath;
    }

    /** Exit plan mode. Restores previous mode and clears plan-file pointer. */
    exitPlanMode(): { restoredMode: PermissionMode; planFilePath: string | null } {
        const restoredMode = this.modeBeforePlan ?? "unrestricted";
        const lastPlanFilePath = this.planFilePath;
        this.currentMode = restoredMode;
        this.modeBeforePlan = null;
        this.planFilePath = null;
        this.emit();
        return { restoredMode, planFilePath: lastPlanFilePath };
    }

    /** Manually set mode (used for tests / external resets). */
    setMode(mode: PermissionMode): void {
        if (mode === "plan") {
            // Use enterPlanMode() instead to assign a plan file path properly.
            // We still allow direct set for completeness, but no file is assigned.
            if (this.currentMode !== "plan") this.modeBeforePlan = this.currentMode;
            this.currentMode = "plan";
        } else {
            // Restoring out of plan
            if (this.currentMode === "plan") this.modeBeforePlan = null;
            this.currentMode = mode;
            this.planFilePath = null;
        }
        this.emit();
    }

    /**
     * Check whether a tool call is permitted under the current mode.
     * - In unrestricted: everything allowed.
     * - In plan: only PLAN_MODE_ALLOWED_TOOLS, plus writes targeting the plan file,
     *   plus read-only shell commands.
     */
    checkPermission(toolName: string, toolArgs?: Record<string, unknown>): ModeOverrideResult {
        if (this.currentMode === "unrestricted") {
            return { decision: "allow" };
        }

        // Plan mode below
        if (PLAN_MODE_ALLOWED_TOOLS.has(toolName)) {
            return { decision: "allow" };
        }

        if (PLAN_MODE_WRITE_TOOLS.has(toolName)) {
            const path = this.extractTargetPath(toolName, toolArgs);
            if (path && this.planFilePath && resolve(path) === resolve(this.planFilePath)) {
                return { decision: "allow" };
            }
            // Also allow writes to any plan file inside the plans dir
            if (path && isWithinDir(path, plansDir()) && path.endsWith(".md")) {
                return { decision: "allow" };
            }
            return {
                decision: "deny",
                reason: `Plan mode: '${toolName}' may only write to the assigned plan file (${this.planFilePath ?? "<no plan file>"}).`,
            };
        }

        if (PLAN_MODE_SHELL_TOOLS.has(toolName)) {
            const cmd = toolArgs?.command;
            if (typeof cmd === "string" && isReadOnlyShellCommand(cmd)) {
                return { decision: "allow" };
            }
            return {
                decision: "deny",
                reason: "Plan mode: only read-only shell commands (ls, cat, git status, etc.) are permitted.",
            };
        }

        // Everything else denied in plan mode (Task, KillBash, Write outside plan file, etc.)
        return {
            decision: "deny",
            reason: `Plan mode: '${toolName}' is not permitted while planning. Call ExitPlanMode to leave plan mode first.`,
        };
    }

    private extractTargetPath(
        toolName: string,
        args?: Record<string, unknown>,
    ): string | null {
        if (!args) return null;
        // Edit / Write / MultiEdit use `file_path`
        const filePath = args.file_path;
        if (typeof filePath === "string") return filePath;
        // ApplyPatch is more complex — extract first add/update path from the patch text.
        if (toolName === "ApplyPatch" && typeof args.input === "string") {
            const m = args.input.match(/^\*\*\*\s+(?:Add|Update|Delete) File:\s+(.+)$/m);
            return m ? m[1].trim() : null;
        }
        return null;
    }
}

/** Ensure the parent directory of a plan file exists. */
export async function ensurePlanDir(planFilePath: string): Promise<void> {
    const dir = dirname(planFilePath);
    if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
    }
}

/**
 * Reminders engine — simplified port of letta-code's src/reminders/*.
 *
 * Upstream ships 9 reminder providers (agent-info, secrets-info,
 * session-context, permission-mode, plan-mode, reflection-step-count,
 * reflection-compaction, command-io, toolset-change). We only need:
 *
 *   • plan-mode  — injected every turn while in plan mode, tells the
 *     agent the rules and points at the plan file path.
 *   • permission-mode — one-shot when mode changes, summarises the
 *     new mode.
 *
 * Reminders are returned as text blobs that ws-session.ts prepends
 * to the user's message content for the upcoming agent turn.
 */

import { relative } from "node:path";

import type { PermissionMode, PlanModeManager } from "./mode-manager.js";

const SYSTEM_REMINDER_OPEN = "<system-reminder>";
const SYSTEM_REMINDER_CLOSE = "</system-reminder>";

const PERMISSION_MODE_DESCRIPTIONS: Record<PermissionMode, string> = {
    plan: "Read-only mode. Focus on exploration and planning.",
    unrestricted: "All tools auto-approved. Bias toward action.",
};

const ODOO_OPERATIONS_REMINDER = `${SYSTEM_REMINDER_OPEN}
Odoo/ERP operations routing: for Odoo read/search/count/group/report operations, always use direct mounted Odoo tools when available: odoo_search, odoo_count, odoo_group, odoo_get_models, or odoo_get_fields. Do not use Bash, Python scripts, Task/subagents, or legacy Odoo skills for normal Odoo lookups. Use Odoo skills only as documentation fallback when direct Odoo tools are unavailable, or when explicitly requested.
${SYSTEM_REMINDER_CLOSE}`;

export interface ReminderState {
    /** Last permission mode we told the agent about, so we only emit on changes. */
    lastNotifiedPermissionMode: PermissionMode | null;
    /** Odoo routing guard only needs to be injected once per session. */
    odooRoutingReminderSent: boolean;
}

export function createReminderState(): ReminderState {
    return { lastNotifiedPermissionMode: null, odooRoutingReminderSent: false };
}

/**
 * Build the plan-mode reminder if plan mode is active.
 * Ported with minor tweaks from upstream's planModeReminder.ts.
 */
export function buildPlanModeReminder(
    mode: PermissionMode,
    planFilePath: string | null,
    workingDirectory: string,
): string | null {
    if (mode !== "plan") return null;

    const applyPatchRelativePath = planFilePath
        ? relative(workingDirectory, planFilePath).replace(/\\/g, "/")
        : null;

    return `${SYSTEM_REMINDER_OPEN}
Plan mode is active. The user indicated that they do not want you to execute yet -- you MUST NOT make any edits (with the exception of the plan file mentioned below), run any non-readonly tools (including changing configs or making commits), or otherwise make any changes to the system. This supersedes any other instructions you have received.

## Plan File Info:
${
    planFilePath
        ? `Write your plan at ${planFilePath} using a write tool (e.g. Write, ApplyPatch, etc.).
${applyPatchRelativePath ? `If using ApplyPatch, use this exact relative patch path: ${applyPatchRelativePath}.` : ""}`
        : "No plan file path assigned. Call EnterPlanMode first."
}

You should build your plan incrementally by writing to or editing this file. NOTE that this is the only file you are allowed to edit - other than this you are only allowed to take READ-ONLY actions.

**Plan File Guidelines:** The plan file should contain only your final recommended approach, not all alternatives considered. Keep it comprehensive yet concise.

## Enhanced Planning Workflow

### Phase 1: Initial Understanding
- Understand the user's request thoroughly
- Explore the codebase to understand existing patterns and relevant code
- Ask the user to clarify ambiguities up front (use AskUserQuestion if available)

### Phase 2: Planning
- Provide background context that may help with the task
- Create a detailed plan

### Phase 3: Synthesis
- Collect findings from exploration
- Track critical files that should be read before implementing the plan
- Ask the user about tradeoffs

### Phase 4: Final Plan
Update the plan file with your synthesized recommendation:
- Recommended approach with rationale
- Key insights
- Critical files that need modification

### Phase 5: Call ExitPlanMode
At the very end of your turn, once you have a clear final plan file - call ExitPlanMode to indicate you are done planning. Your turn should only end with either asking the user a question or calling ExitPlanMode.
${SYSTEM_REMINDER_CLOSE}
`;
}

/**
 * Build the permission-mode reminder if mode just changed.
 * One-shot — fires only when current mode differs from last-notified.
 */
export function buildPermissionModeReminder(
    currentMode: PermissionMode,
    state: ReminderState,
): string | null {
    const previousMode = state.lastNotifiedPermissionMode;
    state.lastNotifiedPermissionMode = currentMode;

    const shouldEmit =
        previousMode === null
            ? currentMode !== "unrestricted" // First turn: only remind if not default
            : previousMode !== currentMode;

    if (!shouldEmit) return null;

    const description = PERMISSION_MODE_DESCRIPTIONS[currentMode];
    const prefix = previousMode === null ? "Permission mode active" : "Permission mode changed to";
    return `${SYSTEM_REMINDER_OPEN}${prefix}: ${currentMode}. ${description}${SYSTEM_REMINDER_CLOSE}\n\n`;
}

/**
 * Build all reminders for the upcoming turn. Mutates `state` to track
 * one-shot delivery (e.g. permission-mode change reminder only fires once).
 */
export function buildTurnReminders(args: {
    planMode: PlanModeManager;
    state: ReminderState;
    workingDirectory: string;
}): string {
    const parts: string[] = [];

    if (!args.state.odooRoutingReminderSent) {
        parts.push(ODOO_OPERATIONS_REMINDER);
        args.state.odooRoutingReminderSent = true;
    }

    const permReminder = buildPermissionModeReminder(args.planMode.getMode(), args.state);
    if (permReminder) parts.push(permReminder);

    const planReminder = buildPlanModeReminder(
        args.planMode.getMode(),
        args.planMode.getPlanFilePath(),
        args.workingDirectory,
    );
    if (planReminder) parts.push(planReminder);

    return parts.join("\n");
}

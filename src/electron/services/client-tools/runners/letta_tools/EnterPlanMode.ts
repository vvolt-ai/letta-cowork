/**
 * EnterPlanMode tool — switches the agent to read-only planning mode.
 *
 * Per-session state is read from the tool-run context (ctx.planMode is
 * a PlanModeManager bound to the active session). The function takes
 * the full args object — the index.ts adapter passes ctx fields as
 * `_runtime_*` keys on args.
 */

import { relative } from "node:path";
import type { PlanModeManager } from "../../../../libs/runner/ws/plan-mode/mode-manager.js";

interface EnterPlanModeArgs {
    name?: string;
    _runtime_conversation_id?: string;
    _runtime_plan_mode?: PlanModeManager;
}

interface EnterPlanModeResult {
    message: string;
    planFilePath: string;
}

export async function enter_plan_mode(args: EnterPlanModeArgs): Promise<EnterPlanModeResult> {
    const planMode = args._runtime_plan_mode;
    const conversationId = args._runtime_conversation_id;
    if (!planMode) {
        throw new Error("EnterPlanMode: plan-mode manager not available in this session.");
    }
    if (!conversationId) {
        throw new Error("EnterPlanMode: no conversation context for this session.");
    }

    const planFilePath = await planMode.enterPlanMode(conversationId, args.name);
    const rel = relative(process.cwd(), planFilePath).replace(/\\/g, "/");

    return {
        message: `Plan mode active. Write your plan at ${planFilePath} (relative: ${rel}). When the plan is ready, call ExitPlanMode.`,
        planFilePath,
    };
}

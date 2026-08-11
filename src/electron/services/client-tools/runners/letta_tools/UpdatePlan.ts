/**
 * UpdatePlan tool — convenience wrapper for writing the plan file.
 * Requires the agent to be in plan mode.
 */

import { writeFile } from "node:fs/promises";

import {
    ensurePlanDir,
    type PlanModeManager,
} from "../../../../libs/runner/ws/plan-mode/mode-manager.js";

interface UpdatePlanArgs {
    plan: string;
    _runtime_plan_mode?: PlanModeManager;
}

interface UpdatePlanResult {
    message: string;
    planFilePath: string;
}

export async function update_plan(args: UpdatePlanArgs): Promise<UpdatePlanResult> {
    if (!args.plan || typeof args.plan !== "string") {
        throw new Error("UpdatePlan: 'plan' must be a non-empty string.");
    }

    const planMode = args._runtime_plan_mode;
    if (!planMode) {
        throw new Error("UpdatePlan: plan-mode manager not available in this session.");
    }

    const planFilePath = planMode.getPlanFilePath();
    if (planMode.getMode() !== "plan" || !planFilePath) {
        throw new Error("UpdatePlan: agent is not in plan mode. Call EnterPlanMode first.");
    }

    await ensurePlanDir(planFilePath);
    await writeFile(planFilePath, args.plan, "utf-8");

    return {
        message: `Plan updated. Length: ${args.plan.length} chars. Continue refining, or call ExitPlanMode when ready.`,
        planFilePath,
    };
}

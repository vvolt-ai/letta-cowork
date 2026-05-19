/**
 * ExitPlanMode tool — leaves plan mode and restores previous permission mode.
 *
 * The plan body is read from the plan file and returned to the caller so
 * the consumer (UI / channel adapter) can surface it.
 */

import { readFile } from "node:fs/promises";
import type { PlanModeManager } from "../../../../libs/runner/ws/plan-mode/mode-manager.js";

interface ExitPlanModeArgs {
    plan?: string;
    _runtime_plan_mode?: PlanModeManager;
}

interface ExitPlanModeResult {
    message: string;
    plan: string | null;
    restoredMode: string;
}

export async function exit_plan_mode(
    args: ExitPlanModeArgs = {},
): Promise<ExitPlanModeResult> {
    const planMode = args._runtime_plan_mode;
    if (!planMode) {
        throw new Error("ExitPlanMode: plan-mode manager not available in this session.");
    }

    const planFilePath = planMode.getPlanFilePath();

    let planBody: string | null = args.plan ?? null;
    if (!planBody && planFilePath) {
        try {
            planBody = await readFile(planFilePath, "utf-8");
        } catch {
            planBody = null;
        }
    }

    const { restoredMode } = planMode.exitPlanMode();

    return {
        message: `Plan mode exited. Restored permission mode: ${restoredMode}.${planBody ? " Plan is ready for user review." : " WARNING: no plan body found."}`,
        plan: planBody,
        restoredMode,
    };
}

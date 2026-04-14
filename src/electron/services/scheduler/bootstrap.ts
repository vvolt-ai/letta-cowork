import { schedulerService } from "./index.js";
import { runScheduledPrompt } from "./run-scheduled-prompt.js";
import { getVeraCoworkApiClient } from "../../api/index.js";

let initialized = false;

export async function ensureSchedulerInitialized(): Promise<void> {
  if (initialized) return;

  const apiClient = getVeraCoworkApiClient();

  await schedulerService.init(apiClient, runScheduledPrompt);
  initialized = true;
}

export function teardownScheduler(): void {
  if (!initialized) return;
  schedulerService.destroy();
  initialized = false;
}
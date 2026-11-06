import { schedulerService } from "./index.js";
import { REMOTE_APP_ONLY } from '../../app-mode.js';
import { runScheduledPrompt } from "./run-scheduled-prompt.js";
import { getVeraCoworkApiClient } from "../../api/index.js";

let initialized = false;

export async function ensureSchedulerInitialized(): Promise<void> {
  if (REMOTE_APP_ONLY || initialized) return;

  const apiClient = getVeraCoworkApiClient();

  await schedulerService.init(apiClient, runScheduledPrompt);
  initialized = true;
}

export function teardownScheduler(): void {
  if (!initialized) return;
  schedulerService.destroy();
  initialized = false;
}
/**
 * Scheduler Service
 *
 * Fetches scheduled tasks from the vera-cowork-server backend, registers local
 * node-cron jobs, executes Letta agent sessions when a job fires, and posts run
 * logs back to the backend on completion.
 */

import cron from "node-cron";

import type {
  ScheduledTask,
  ScheduleRun,
  CreateScheduleRunDto,
  UpdateScheduleRunDto,
} from "../../api/endpoints/scheduler.js";
import type { ScheduledTask as CronScheduledTask } from "node-cron";

type OnRunSession = (agentId: string, conversationId: string | null, prompt: string) => Promise<{
  output: string | null;
  conversationId: string | null;
  error: string | null;
}>;

type ApiClient = {
  scheduler: {
    listTasks: () => Promise<ScheduledTask[]>;
    createRun: (id: string, dto: CreateScheduleRunDto) => Promise<ScheduleRun>;
    updateRun: (taskId: string, runId: string, dto: UpdateScheduleRunDto) => Promise<ScheduleRun>;
    runTaskNow: (id: string) => Promise<ScheduleRun>;
    toggleTask: (id: string) => Promise<ScheduledTask>;
  };
};

interface SchedulerJob {
  taskId: string;
  task: CronScheduledTask;
}

export type SchedulerRunResult = {
  taskId: string;
  status: "completed" | "failed";
  startedAt: string;
  completedAt: string;
  output: string | null;
  error: string | null;
  conversationId: string | null;
};

class SchedulerService {
  private jobs = new Map<string, SchedulerJob>();
  private apiClient: ApiClient | null = null;
  private onRunSession: OnRunSession | null = null;
  private syncInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Initialize the scheduler.
   * Called once at app startup after auth is confirmed.
   */
  async init(apiClient: ApiClient, onRunSession: OnRunSession) {
    this.apiClient = apiClient;
    this.onRunSession = onRunSession;

    await this.syncTasks();

    // Re-sync with backend every 5 minutes to pick up new/modified tasks
    this.syncInterval = setInterval(() => {
      this.syncTasks().catch((err) =>
        console.warn("[Scheduler] Failed to sync tasks:", err)
      );
    }, 5 * 60 * 1000);
  }

  /**
   * Fetch all enabled tasks from backend and (re)register cron jobs.
   */
  async syncTasks() {
    if (!this.apiClient) return;

    let tasks: ScheduledTask[] = [];
    try {
      tasks = await this.apiClient.scheduler.listTasks();
    } catch (err) {
      console.warn("[Scheduler] Failed to fetch tasks:", err);
      return;
    }

    const activeTasks = tasks.filter((t) => t.enabled && (t.executionTarget ?? "cowork") === "cowork");
    const activeIds = new Set(activeTasks.map((t) => t.id));

    // Remove stale jobs (deleted or disabled tasks)
    for (const [id, job] of this.jobs) {
      if (!activeIds.has(id)) {
        job.task.stop();
        this.jobs.delete(id);
        console.log(`[Scheduler] Removed job for task ${id}`);
      }
    }

    // Add/refresh jobs for active tasks
    for (const task of activeTasks) {
      const existing = this.jobs.get(task.id);
      if (existing) {
        // Already registered — stop and re-add to pick up cron expression changes
        existing.task.stop();
        this.jobs.delete(task.id);
      }
      this.registerJob(task);
    }

    console.log(`[Scheduler] Synced ${activeTasks.length} active task(s)`);
  }

  /**
   * Register a single cron job for a task.
   */
  private registerJob(task: ScheduledTask) {
    const expression = task.cronExpression;
    if (!cron.validate(expression)) {
      console.warn(`[Scheduler] Invalid cron expression for task "${task.name}": ${expression}`);
      return;
    }

    const job = cron.schedule(
      expression,
      () => {
        console.log(`[Scheduler] Firing task "${task.name}" (${task.id})`);
        this.executeTask(task).catch((err) =>
          console.error(`[Scheduler] Error executing task "${task.name}":`, err)
        );
      },
      {
        timezone: task.timezone,
      }
    );

    this.jobs.set(task.id, { taskId: task.id, task: job });
    console.log(`[Scheduler] Registered job "${task.name}" → ${expression} (${task.timezone})`);
  }

  /**
   * Execute a task: run the Letta session and post/patch the run log.
   *
   * Flow:
   *   1. POST a `running` run row → capture runId
   *   2. Invoke the agent
   *   3. PATCH the same runId with the final status + output + completedAt
   *
   * The server fires the channel notification (WhatsApp etc.) on the
   * PATCH that transitions the row into a terminal state.
   *
   * If step 1 fails (server unreachable etc.) we have no runId to patch
   * later, so we fall back to POSTing a single completed row — the
   * notification still fires from createRun's terminal-status branch.
   */
  private async executeTask(task: ScheduledTask): Promise<SchedulerRunResult | null> {
    if (!this.apiClient || !this.onRunSession) return null;

    const startedAt = new Date().toISOString();
    let runId: string | null = null;

    // Step 1: open a `running` row on the backend
    try {
      const initRun = await this.apiClient.scheduler.createRun(task.id, {
        startedAt,
        status: "running",
      });
      runId = initRun.id;
    } catch (err) {
      console.warn(
        `[Scheduler] Failed to create initial run log for task ${task.id} ` +
          `(will fall back to single-POST on completion):`,
        err
      );
    }

    // Step 2: actually run the agent
    let output: string | null = null;
    let error: string | null = null;
    let resultConversationId: string | null = task.conversationId ?? null;
    let finalStatus: "completed" | "failed" = "completed";

    try {
      const result = await this.onRunSession(task.agentId, task.conversationId, task.prompt);
      output = result.output;
      error = result.error;
      resultConversationId = result.conversationId ?? resultConversationId;
      if (result.error) finalStatus = "failed";
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      finalStatus = "failed";
      console.error(`[Scheduler] Session error for task "${task.name}":`, err);
    }

    const completedAt = new Date().toISOString();

    // Step 3: close the row. PATCH if we have a runId, otherwise POST as
    // a single completed record (fallback path for when the initial
    // create failed).
    try {
      if (runId) {
        await this.apiClient.scheduler.updateRun(task.id, runId, {
          completedAt,
          status: finalStatus,
          output: output ?? undefined,
          error: error ?? undefined,
          conversationId: resultConversationId ?? undefined,
        });
      } else {
        await this.apiClient.scheduler.createRun(task.id, {
          startedAt,
          completedAt,
          status: finalStatus,
          output: output ?? undefined,
          error: error ?? undefined,
          conversationId: resultConversationId ?? undefined,
        });
      }
    } catch (err) {
      console.error(`[Scheduler] Failed to post run log for task ${task.id}:`, err);
    }

    console.log(`[Scheduler] Task "${task.name}" ${finalStatus}`);

    return {
      taskId: task.id,
      status: finalStatus,
      startedAt,
      completedAt,
      output,
      error,
      conversationId: resultConversationId ?? null,
    };
  }

  /**
   * Force refresh — call after creating/updating/deleting a task via UI.
   */
  async refresh() {
    await this.syncTasks();
  }

  /**
   * Manually trigger a task immediately.
   */
  async runTaskNow(taskId: string): Promise<SchedulerRunResult> {
    if (!this.apiClient) {
      throw new Error("Scheduler not initialized");
    }

    // Pull latest definition to avoid running stale cron expressions
    const tasks = await this.apiClient.scheduler.listTasks();
    const task = tasks.find((t) => t.id === taskId);
    if (!task) {
      throw new Error("Task not found");
    }

    if ((task.executionTarget ?? "cowork") === "server") {
      const run = await this.apiClient.scheduler.runTaskNow(task.id);
      return {
        taskId: task.id,
        status: run.status === "failed" ? "failed" : "completed",
        startedAt: run.startedAt,
        completedAt: run.completedAt ?? new Date().toISOString(),
        output: run.output,
        error: run.error,
        conversationId: run.conversationId,
      };
    }

    const result = await this.executeTask(task);
    if (!result) {
      throw new Error("Scheduler service not ready to execute");
    }
    return result;
  }

  /**
   * Shutdown — stop all jobs and intervals.
   */
  destroy() {
    for (const [, job] of this.jobs) {
      job.task.stop();
    }
    this.jobs.clear();
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  /**
   * Get the count of currently registered jobs.
   */
  get activeJobCount() {
    return this.jobs.size;
  }
}

export const schedulerService = new SchedulerService();

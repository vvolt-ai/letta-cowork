/**
 * Scheduler IPC Handlers
 *
 * Exposes scheduler CRUD operations to the renderer via ipcMain.
 * All calls proxy to the vera-cowork-server via the authenticated API client.
 *
 * IMPORTANT: Every handler checks isAuthenticated() first and catches errors
 * locally — scheduler failures must NEVER trigger the global auth-expired logout.
 */

import { ipcMain } from "electron";
import { getVeraCoworkApiClient } from "../../api/index.js";
import type { CreateScheduledTaskDto } from "../../api/endpoints/scheduler.js";
import { schedulerService } from "../../services/scheduler/index.js";

function api() {
  return getVeraCoworkApiClient();
}

function checkAuth() {
  if (!api().isAuthenticated()) {
    throw new Error("Not authenticated");
  }
}

export function registerSchedulerHandlers() {
  // List all scheduled tasks
  ipcMain.handle("scheduler:list", async () => {
    try {
      checkAuth();
      return await api().scheduler.listTasks();
    } catch (err) {
      console.warn("[Scheduler IPC] scheduler:list failed:", err);
      return [];
    }
  });

  // Create a new task
  ipcMain.handle("scheduler:create", async (_event, dto: CreateScheduledTaskDto) => {
    checkAuth();
    const task = await api().scheduler.createTask(dto);
    schedulerService.refresh().catch(console.warn);
    return task;
  });

  // Update an existing task
  ipcMain.handle("scheduler:update", async (_event, id: string, dto: Partial<CreateScheduledTaskDto>) => {
    checkAuth();
    const task = await api().scheduler.updateTask(id, dto);
    schedulerService.refresh().catch(console.warn);
    return task;
  });

  // Toggle enable/disable
  ipcMain.handle("scheduler:toggle", async (_event, id: string) => {
    checkAuth();
    const task = await api().scheduler.toggleTask(id);
    schedulerService.refresh().catch(console.warn);
    return task;
  });

  // Delete a task
  ipcMain.handle("scheduler:delete", async (_event, id: string) => {
    checkAuth();
    await api().scheduler.deleteTask(id);
    schedulerService.refresh().catch(console.warn);
    return { success: true };
  });

  // Run a task immediately
  ipcMain.handle("scheduler:run-now", async (_event, id: string) => {
    try {
      checkAuth();
      const result = await schedulerService.runTaskNow(id);
      return result;
    } catch (err) {
      console.warn("[Scheduler IPC] scheduler:run-now failed:", err);
      throw err;
    }
  });

  // Get run history for a task
  ipcMain.handle("scheduler:runs", async (_event, id: string, limit?: number, offset?: number) => {
    try {
      checkAuth();
      return await api().scheduler.listRuns(id, limit, offset);
    } catch (err) {
      console.warn("[Scheduler IPC] scheduler:runs failed:", err);
      return { runs: [], total: 0 };
    }
  });
}

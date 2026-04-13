/**
 * Scheduler IPC Handlers
 *
 * Exposes scheduler CRUD operations to the renderer via ipcMain.
 * All calls proxy to the vera-cowork-server via the authenticated API client.
 */

import { ipcMain } from "electron";
import { getVeraCoworkApiClient } from "../../api/index.js";
import type { CreateScheduledTaskDto } from "../../api/endpoints/scheduler.js";
import { schedulerService } from "../../services/scheduler/index.js";

export function registerSchedulerHandlers() {
  // List all scheduled tasks
  ipcMain.handle("scheduler:list", async () => {
    return getVeraCoworkApiClient().scheduler.listTasks();
  });

  // Create a new task
  ipcMain.handle("scheduler:create", async (_event, dto: CreateScheduledTaskDto) => {
    const task = await getVeraCoworkApiClient().scheduler.createTask(dto);
    schedulerService.refresh().catch(console.warn);
    return task;
  });

  // Update an existing task
  ipcMain.handle("scheduler:update", async (_event, id: string, dto: Partial<CreateScheduledTaskDto>) => {
    const task = await getVeraCoworkApiClient().scheduler.updateTask(id, dto);
    schedulerService.refresh().catch(console.warn);
    return task;
  });

  // Toggle enable/disable
  ipcMain.handle("scheduler:toggle", async (_event, id: string) => {
    const task = await getVeraCoworkApiClient().scheduler.toggleTask(id);
    schedulerService.refresh().catch(console.warn);
    return task;
  });

  // Delete a task
  ipcMain.handle("scheduler:delete", async (_event, id: string) => {
    await getVeraCoworkApiClient().scheduler.deleteTask(id);
    schedulerService.refresh().catch(console.warn);
    return { success: true };
  });

  // Get run history for a task
  ipcMain.handle("scheduler:runs", async (_event, id: string, limit?: number, offset?: number) => {
    return getVeraCoworkApiClient().scheduler.listRuns(id, limit, offset);
  });
}

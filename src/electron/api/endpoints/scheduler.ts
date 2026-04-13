/**
 * Scheduler API Endpoints
 * 
 * Wraps the /schedules REST endpoints on the vera-cowork-server.
 */

import type { BaseHttpClient } from "../client/base-client.js";

export interface ScheduledTask {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  prompt: string;
  agentId: string;
  conversationId: string | null;
  scheduleType: "recurring" | "one_off";
  cronExpression: string;
  timezone: string;
  enabled: boolean;
  notifyChannelId: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  runCount?: number;
  lastRun?: ScheduleRun | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleRun {
  id: string;
  taskId: string;
  startedAt: string;
  completedAt: string | null;
  status: "running" | "completed" | "failed";
  output: string | null;
  error: string | null;
  conversationId: string | null;
  createdAt: string;
}

export interface CreateScheduledTaskDto {
  name: string;
  description?: string;
  prompt: string;
  agentId: string;
  conversationId?: string;
  scheduleType: "recurring" | "one_off";
  cronExpression: string;
  timezone?: string;
  enabled?: boolean;
  notifyChannelId?: string;
}

export interface CreateScheduleRunDto {
  startedAt: string;
  completedAt?: string;
  status: "running" | "completed" | "failed";
  output?: string;
  error?: string;
  conversationId?: string;
}

export class SchedulerEndpoints {
  constructor(private readonly client: BaseHttpClient) {}

  listTasks(): Promise<ScheduledTask[]> {
    return this.client.request<ScheduledTask[]>("/schedules");
  }

  createTask(dto: CreateScheduledTaskDto): Promise<ScheduledTask> {
    return this.client.request<ScheduledTask>("/schedules", {
      method: "POST",
      body: dto as unknown as Record<string, unknown>,
    });
  }

  getTask(id: string): Promise<ScheduledTask> {
    return this.client.request<ScheduledTask>(`/schedules/${id}`);
  }

  updateTask(id: string, dto: Partial<CreateScheduledTaskDto>): Promise<ScheduledTask> {
    return this.client.request<ScheduledTask>(`/schedules/${id}`, {
      method: "PATCH",
      body: dto as unknown as Record<string, unknown>,
    });
  }

  toggleTask(id: string): Promise<ScheduledTask> {
    return this.client.request<ScheduledTask>(`/schedules/${id}/toggle`, {
      method: "PATCH",
    });
  }

  deleteTask(id: string): Promise<void> {
    return this.client.request<void>(`/schedules/${id}`, {
      method: "DELETE",
    });
  }

  listRuns(id: string, limit = 50, offset = 0): Promise<{ runs: ScheduleRun[]; total: number }> {
    return this.client.request<{ runs: ScheduleRun[]; total: number }>(
      `/schedules/${id}/runs?limit=${limit}&offset=${offset}`
    );
  }

  createRun(id: string, dto: CreateScheduleRunDto): Promise<ScheduleRun> {
    return this.client.request<ScheduleRun>(`/schedules/${id}/runs`, {
      method: "POST",
      body: dto as unknown as Record<string, unknown>,
    });
  }
}

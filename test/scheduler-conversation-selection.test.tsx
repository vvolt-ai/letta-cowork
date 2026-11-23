import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

import { SchedulerEndpoints, type CreateScheduledTaskDto } from "../src/electron/api/endpoints/scheduler";
import type { BaseHttpClient } from "../src/electron/api/client/base-client";
import { CreateScheduleDialog } from "../src/ui/features/scheduler/CreateScheduleDialog";
import { normalizeScheduleConversationId } from "../src/ui/features/scheduler/types";

const readSource = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

for (const [input, expected] of [
  ["", null],
  [" \t\n ", null],
  ["conv-synthetic", "conv-synthetic"],
  ["  conv-synthetic \n", "conv-synthetic"],
] as const) {
  test(`conversation selection normalizes ${JSON.stringify(input)} to ${JSON.stringify(expected)}`, () => {
    expect(normalizeScheduleConversationId(input)).toBe(expected);
  });
}

// Fake transport only: serialize bodies as the HTTP client does, without importing
// credentials, starting Electron, making requests, or executing any schedule.
function captureRequests() {
  const calls: { path: string; method: string; body: Record<string, unknown> }[] = [];
  const client = {
    request: async (path: string, options: { method: string; body: Record<string, unknown> }) => {
      calls.push({ path, method: options.method, body: JSON.parse(JSON.stringify(options.body)) });
      return {};
    },
  } as unknown as BaseHttpClient;
  return { api: new SchedulerEndpoints(client), calls };
}

const createDto: CreateScheduledTaskDto = {
  name: "Synthetic schedule",
  prompt: "Offline fixture only",
  agentId: "agent-synthetic",
  scheduleType: "recurring",
  cronExpression: "0 9 * * *",
};

test("create and edit transport preserve explicit resets and trimmed specific IDs", async () => {
  const { api, calls } = captureRequests();
  for (const input of ["", " \t ", "  conv-synthetic  "]) {
    const conversationId = normalizeScheduleConversationId(input);
    await api.createTask({ ...createDto, conversationId });
    await api.updateTask("task-synthetic", { conversationId });
    for (const call of calls.slice(-2)) {
      expect(Object.hasOwn(call.body, "conversationId")).toBe(true);
      expect(call.body.conversationId).toBe(conversationId);
    }
  }
  expect(calls.map(({ method }) => method)).toEqual(["POST", "PATCH", "POST", "PATCH", "POST", "PATCH"]);
  expect(calls[1].path).toBe("/schedules/task-synthetic");
});

test("New conversation clears an existing binding, while unrelated partial updates omit it", async () => {
  const { api, calls } = captureRequests();
  const persisted = { conversationId: "conv-old-synthetic", enabled: true };
  await api.updateTask("task-synthetic", { enabled: false });
  expect(Object.hasOwn(calls[0].body, "conversationId")).toBe(false);
  expect({ ...persisted, ...calls[0].body }.conversationId).toBe("conv-old-synthetic");

  await api.updateTask("task-synthetic", { conversationId: normalizeScheduleConversationId("") });
  expect(calls[1].body).toEqual({ conversationId: null });
  expect({ ...persisted, ...calls[1].body }.conversationId).toBeNull();

  await api.updateTask("task-synthetic", { enabled: true, conversationId: undefined });
  expect(calls[2].body).toEqual({ enabled: true });
});

test("both full-form save handlers use the normalizer (not omission)", () => {
  const panel = readSource("src/ui/features/scheduler/SchedulesPanel.tsx");
  for (const [start, end] of [["const handleCreate =", "const handleEdit ="], ["const handleEdit =", "const handleToggle ="]]) {
    const handler = panel.slice(panel.indexOf(start), panel.indexOf(end));
    expect(handler).toContain("conversationId: normalizeScheduleConversationId(form.conversationId)");
    expect(handler).not.toContain("conversationId: form.conversationId || undefined");
  }
});

test("IPC/preload forward scheduler DTOs unchanged, including explicit null", () => {
  const preload = readSource("src/electron/preload.cts");
  expect(preload).toContain('electron.ipcRenderer.invoke("scheduler:create", dto)');
  expect(preload).toContain('electron.ipcRenderer.invoke("scheduler:update", id, dto)');
  const handlers = readSource("src/electron/ipc/handlers/scheduler-handlers.ts");
  expect(handlers).toContain("dto: CreateScheduledTaskDto");
  expect(handlers).toContain("dto: Partial<CreateScheduledTaskDto>");
  expect(handlers).toContain("api().scheduler.createTask(dto)");
  expect(handlers).toContain("api().scheduler.updateTask(id, dto)");
});

test("create/edit hints explain reset, no cancellation, and first-success pinning", () => {
  for (const mode of ["create", "edit"] as const) {
    const html = renderToStaticMarkup(
      <CreateScheduleDialog open mode={mode} onClose={() => {}} onSave={async () => { throw Error("No writes in this test"); }} />,
    );
    expect(html).toContain("New conversation");
    expect(html).toContain("resets the selected conversation");
    expect(html).toContain("does not cancel previous work");
    expect(html).toContain("after the first successful run");
    expect(html).toContain("rather than starting fresh every run");
  }
});

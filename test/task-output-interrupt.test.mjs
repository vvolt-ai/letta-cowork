import assert from "node:assert/strict";
import test from "node:test";

import { backgroundTasks } from "../dist-electron/services/client-tools/runners/_shared/process_manager.js";
import { task_output } from "../dist-electron/services/client-tools/runners/letta_tools/TaskOutput.js";

test("TaskOutput interruption stops waiting without cancelling the task", async () => {
  const taskId = "task_interrupt_test";
  backgroundTasks.set(taskId, {
    description: "Interrupt wait test",
    subagentType: "test",
    subagentId: "test-agent",
    status: "running",
    output: [],
    startTime: new Date(),
    outputFile: "/nonexistent/task-output.log",
  });
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 25);

  try {
    await assert.rejects(
      task_output({
        task_id: taskId,
        block: true,
        timeout: 60_000,
        signal: controller.signal,
      }),
      { name: "AbortError" },
    );
    assert.equal(backgroundTasks.get(taskId)?.status, "running");
  } finally {
    backgroundTasks.delete(taskId);
  }
});

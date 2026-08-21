import test from "node:test";
import assert from "node:assert/strict";

import { task_update } from "../dist-electron/services/client-tools/runners/letta_tools/TaskUpdate.js";
import {
  _resetTaskStoreForTests,
  createTask,
  getTask,
} from "../dist-electron/services/client-tools/runners/letta_tools/tasks/store.js";

test("TaskUpdate merges structured metadata, removes null keys, and hard-deletes", async () => {
  _resetTaskStoreForTests();
  const created = createTask({
    subject: "Test task",
    description: "Verify parity",
    metadata: { keep: "yes", remove: "soon" },
  });

  const updated = await task_update({
    taskId: created.taskId,
    metadata: { remove: null, nested: { enabled: true }, count: 2 },
  });
  assert.deepEqual(updated.metadata, {
    keep: "yes",
    nested: { enabled: true },
    count: 2,
  });

  const deleted = await task_update({ taskId: created.taskId, status: "deleted" });
  assert.equal(deleted.status, "deleted");
  assert.equal(getTask(created.taskId), undefined);
});

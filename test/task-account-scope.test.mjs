import test from "node:test";
import assert from "node:assert/strict";

import { getTaskClient } from "../dist-electron/services/client-tools/runners/letta_tools/Task.js";

test("Task reuses the parent account-scoped Letta client", () => {
  const scopedClient = { account: "connection-123" };
  assert.equal(getTaskClient(scopedClient), scopedClient);
});

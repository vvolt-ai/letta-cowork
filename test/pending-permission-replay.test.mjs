import assert from "node:assert/strict";
import test from "node:test";

import { snapshotPendingPermissionRequests } from "../dist-electron/ipc/handlers/session/pending-permission-replay.js";

test("pending permission replay snapshots without mutating live requests", () => {
  const resolve = () => undefined;
  const pendingPermissions = new Map([
    [
      "tool-call-1",
      {
        toolUseId: "tool-call-1",
        toolName: "AskUserQuestion",
        input: { questions: [{ question: "Continue?" }] },
        resolve,
      },
    ],
  ]);

  assert.deepEqual(snapshotPendingPermissionRequests(pendingPermissions.values()), [
    {
      toolUseId: "tool-call-1",
      toolName: "AskUserQuestion",
      input: { questions: [{ question: "Continue?" }] },
    },
  ]);
  assert.equal(pendingPermissions.get("tool-call-1")?.resolve, resolve);
  assert.equal(pendingPermissions.size, 1);
});

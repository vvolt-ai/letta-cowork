import assert from "node:assert/strict";
import test from "node:test";

import { createStreamStallGuard } from "../dist-electron/libs/runner/ws/stream-stall-guard.js";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("stream stall guard aborts a silent terminal run reader", async () => {
  let aborted = 0;
  const guard = createStreamStallGuard({
    getRunId: () => "run-1",
    getStopReason: () => null,
    retrieveRunStatus: async () => "completed",
    abortHttpRead: () => {
      aborted += 1;
    },
    stallMs: 5,
    statusTimeoutMs: 20,
  });

  await wait(20);
  assert.equal(guard.fired(), true);
  assert.equal(aborted, 1);
  guard.clear();
});

test("stream stall guard keeps waiting for an active run", async () => {
  let aborted = 0;
  const guard = createStreamStallGuard({
    getRunId: () => "run-1",
    getStopReason: () => null,
    retrieveRunStatus: async () => "running",
    abortHttpRead: () => {
      aborted += 1;
    },
    stallMs: 5,
    statusTimeoutMs: 20,
  });

  await wait(16);
  guard.clear();
  assert.equal(guard.fired(), false);
  assert.equal(aborted, 0);
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyStreamTermination,
  TerminalStopReasonError,
} from "../dist-electron/libs/runner/sdk/terminal-stop.js";

test("missing stop reason remains resumable", () => {
  assert.equal(classifyStreamTermination(null), "resume");
  assert.equal(classifyStreamTermination(undefined), "resume");
  assert.equal(classifyStreamTermination(""), "resume");
});

test("normal terminal stop reasons complete without reconnecting", () => {
  for (const reason of ["end_turn", "stop", "tool_call", "requires_approval"]) {
    assert.equal(classifyStreamTermination(reason), "complete", reason);
  }
});

test("LLM and provider failure stop reasons propagate as errors", () => {
  for (const reason of [
    "llm_api_error",
    "internal_error",
    "error",
    "provider_error",
    "run_failed",
  ]) {
    assert.equal(classifyStreamTermination(reason), "error", reason);
  }
});

test("terminal stop errors preserve semantic reason and transport cause", () => {
  const cause = new Error("WS proxy stream idle timed out");
  const error = new TerminalStopReasonError(
    "run-123",
    "llm_api_error",
    cause
  );

  assert.equal(error.name, "TerminalStopReasonError");
  assert.equal(error.runId, "run-123");
  assert.equal(error.stopReason, "llm_api_error");
  assert.equal(error.cause, cause);
  assert.match(error.message, /llm_api_error/);
  assert.match(error.message, /WS proxy stream idle timed out/);
});

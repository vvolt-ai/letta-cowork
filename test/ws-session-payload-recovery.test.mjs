import test from "node:test";
import assert from "node:assert/strict";

import {
  compactToolContinuationMessagesFor413,
  isRequestEntityTooLargeError,
} from "../dist-electron/libs/runner/ws/session.js";

test("recognizes SDK-style HTTP 413 errors", () => {
  assert.equal(
    isRequestEntityTooLargeError({
      status: 413,
      error: { message: "request entity too large" },
    }),
    true,
  );
  assert.equal(isRequestEntityTooLargeError(new Error("network timeout")), false);
});

test("compacts parallel approval tool returns for one safe retry", () => {
  const messages = [
    {
      type: "approval",
      approvals: Array.from({ length: 8 }, (_, index) => ({
        type: "tool",
        tool_call_id: `call-${index}`,
        tool_return: `result-${index}:` + "x".repeat(32_000),
        status: "success",
      })),
    },
  ];

  const compacted = compactToolContinuationMessagesFor413(messages);
  assert.ok(compacted);
  assert.ok(Buffer.byteLength(JSON.stringify(compacted), "utf8") < 25_000);
  assert.equal(messages[0].approvals[0].tool_return.length, 32_009);
  assert.match(
    compacted[0].approvals[0].tool_return,
    /compacted after the server rejected the continuation/i,
  );
});

test("does not retry by silently changing ordinary user messages", () => {
  assert.equal(
    compactToolContinuationMessagesFor413([
      { role: "user", content: "x".repeat(200_000) },
    ]),
    null,
  );
});

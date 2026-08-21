import test from "node:test";
import assert from "node:assert/strict";

import {
  ORGANIZATION_DEFAULT_LETTA_CONNECTION,
  getLettaConnectionScope,
} from "../dist-electron/services/letta-runtime/index.js";

test("keeps Vera organization-default account selection explicit", () => {
  assert.equal(
    getLettaConnectionScope(undefined),
    ORGANIZATION_DEFAULT_LETTA_CONNECTION,
  );
  assert.equal(getLettaConnectionScope(""), ORGANIZATION_DEFAULT_LETTA_CONNECTION);
  assert.equal(getLettaConnectionScope("   "), ORGANIZATION_DEFAULT_LETTA_CONNECTION);
});

test("normalizes an explicitly selected Letta connection", () => {
  assert.equal(getLettaConnectionScope("  connection-123  "), "connection-123");
});

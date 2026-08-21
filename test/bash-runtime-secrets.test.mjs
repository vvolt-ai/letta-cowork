import test from "node:test";
import assert from "node:assert/strict";

import { bashTool } from "../dist-electron/services/client-tools/runners/bash.js";

test("Bash expands braced runtime secrets and redacts their values", async () => {
  const secret = "migration-secret-value-9247";
  const result = await bashTool.run(
    {
      command: `printf '%s' "\${MIGRATION_SECRET:-}"`,
      description: "Check braced runtime secret",
    },
    {
      signal: new AbortController().signal,
      runtimeEnv: { MIGRATION_SECRET: secret },
    },
  );

  assert.equal(result.isError, false);
  assert.doesNotMatch(result.output, new RegExp(secret));
  assert.match(result.output, /REDACTED/i);
});

test("Bash rejects unsupported background execution explicitly", async () => {
  const result = await bashTool.run(
    {
      command: "echo no-op",
      description: "Check background contract",
      run_in_background: true,
    },
    { signal: new AbortController().signal },
  );
  assert.equal(result.isError, true);
  assert.match(result.output, /not supported/i);
});

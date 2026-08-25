import assert from "node:assert/strict";
import test from "node:test";

import { glob } from "../dist-electron/services/client-tools/runners/letta_tools/Glob.js";
import { grep } from "../dist-electron/services/client-tools/runners/letta_tools/Grep.js";

for (const [name, run] of [
  ["Glob", (signal) => glob({ pattern: "**/*", signal })],
  ["Grep", (signal) => grep({ pattern: "needle", path: ".", signal })],
]) {
  test(`${name} preserves AbortError instead of converting interruption to output`, async () => {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(run(controller.signal), { name: "AbortError" });
  });
}

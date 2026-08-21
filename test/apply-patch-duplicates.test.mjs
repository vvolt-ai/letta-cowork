import test from "node:test";
import assert from "node:assert/strict";

import { apply_patch } from "../dist-electron/services/client-tools/runners/letta_tools/ApplyPatch.js";

const duplicatePatch = `*** Begin Patch
*** Add File: duplicate-target.txt
+first
*** Add File: ./duplicate-target.txt
+second
*** End Patch`;

test("ApplyPatch rejects operations resolving to the same path", async () => {
  await assert.rejects(
    () => apply_patch({ input: duplicatePatch }),
    /multiple operations target \.\/duplicate-target\.txt/,
  );
});

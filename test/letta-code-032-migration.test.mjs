import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  getCurrentWorkingDirectory,
  setRuntimeContext,
} from "../dist-electron/services/client-tools/runners/_shared/runtime-context.js";
import { truncateByChars } from "../dist-electron/services/client-tools/runners/_shared/truncation.js";
import { ls } from "../dist-electron/services/client-tools/runners/letta_tools/LS.js";

test("LS resolves relative paths from the scoped runtime cwd", async () => {
  const root = await mkdtemp(join(tmpdir(), "cowork-ls-cwd-"));
  const child = join(root, "nested");
  await mkdir(child);
  await writeFile(join(child, "proof.txt"), "ok", "utf8");
  setRuntimeContext({ workingDirectory: root });

  try {
    assert.equal(getCurrentWorkingDirectory(), root);
    const result = await ls({ path: "nested" });
    assert.match(result.content[0].text, /proof\.txt/);
    assert.ok(result.content[0].text.includes(root));
  } finally {
    setRuntimeContext(undefined);
    await rm(root, { recursive: true, force: true });
  }
});

test("truncation returns a short preview only after preserving full output", async () => {
  const root = await mkdtemp(join(tmpdir(), "cowork-overflow-"));
  const full = "0123456789".repeat(50);
  const result = truncateByChars(full, 100, "MigrationTest", {
    workingDirectory: root,
    previewChars: 20,
  });

  try {
    assert.equal(result.wasTruncated, true);
    assert.ok(result.overflowPath);
    assert.equal(result.content.slice(0, 20), full.slice(0, 20));
    assert.match(result.content, /showing 20 of 500 characters/);
    assert.equal(await readFile(result.overflowPath, "utf8"), full);
  } finally {
    if (result.overflowPath) {
      await rm(result.overflowPath, { force: true });
    }
    await rm(root, { recursive: true, force: true });
  }
});

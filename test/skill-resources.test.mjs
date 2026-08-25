import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { listSkillResources } from "../dist-electron/services/client-tools/runners/skill.js";

test("skill activation lists bundled resources recursively", async () => {
  const root = await mkdtemp(join(tmpdir(), "cowork-skill-resources-"));
  try {
    await mkdir(join(root, "scripts"));
    await mkdir(join(root, "references"));
    await writeFile(join(root, "SKILL.md"), "# Test");
    await writeFile(join(root, "scripts", "run.py"), "pass");
    await writeFile(join(root, "references", "guide.md"), "guide");

    assert.deepEqual(listSkillResources(join(root, "SKILL.md")), {
      paths: ["references/guide.md", "scripts/run.py"],
      truncated: false,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

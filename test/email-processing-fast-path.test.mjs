import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const skillUrl = new URL("../skills/email-processing/SKILL.md", import.meta.url);
const poUrl = new URL(
  "../skills/email-processing/references/po-processing.md",
  import.meta.url,
);
const apiSkillUrl = new URL("../skills/cowork-emails/SKILL.md", import.meta.url);

test("email workflow uses supplied identifiers before discovery", async () => {
  const content = await readFile(skillUrl, "utf8");

  assert.match(content, /Reuse supplied full body, message\/account\/folder IDs/i);
  assert.match(content, /Do not rediscover a known email/i);
  assert.match(content, /Vera email\/attachment tools/i);
  assert.doesNotMatch(content, /curl\.exe/);
  assert.ok(
    content.indexOf("## Step 2 — Inspect every relevant attachment") <
      content.indexOf("## Step 4 — Bounded business verification"),
  );
});

test("PO workflow starts with exact bounded configured-MCP reads", async () => {
  const content = await readFile(poUrl, "utf8");

  assert.match(content, /enabled configured MCP/i);
  assert.match(content, /default_code/);
  assert.match(content, /limits 5–10/);
  assert.match(content, /No broad family enumeration/i);
  assert.doesNotMatch(content, /\/odoo\/models\/search/);
  assert.doesNotMatch(content, /TOKEN=\$\(cat/);
});

test("email API skill exposes the local identifier fast path first", async () => {
  const content = await readFile(apiSkillUrl, "utf8");

  assert.ok(content.indexOf("## Fast path before discovery") < content.indexOf("## Base URL"));
  assert.match(content, /Do \*\*not\*\* list remote channels\/accounts\/folders first/);
});

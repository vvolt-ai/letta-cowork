import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const skillUrl = new URL("../skills/email-processing/SKILL.md", import.meta.url);
const poUrl = new URL(
  "../skills/email-processing/references/po-processing.md",
  import.meta.url,
);
const apiSkillUrl = new URL("../skills/vera-mcp/SKILL.md", import.meta.url);

test("email workflow uses supplied identifiers before discovery", async () => {
  const content = await readFile(skillUrl, "utf8");

  assert.ok(content.length < 8000, "Keep the always-loaded entry lean");
  assert.match(content, /Reuse supplied exact IDs and complete content/i);
  assert.match(content, /Do not restart discovery or refetch successful current-turn evidence/i);
  assert.match(content, /Do not load it for ignore or routine brief review/i);
  assert.doesNotMatch(content, /curl\.exe/);
  const detailed = await readFile(new URL("../skills/email-processing/references/investigation-workflow.md", import.meta.url), "utf8");
  assert.match(detailed, /Reuse supplied full body, message\/account\/folder IDs/i);
  assert.match(detailed, /Do not rediscover a known email/i);
  assert.match(detailed, /Vera email\/attachment tools/i);
  assert.ok(
    detailed.indexOf("## Step 2 — Inspect every relevant attachment") <
      detailed.indexOf("## Step 4 — Bounded business verification"),
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

test("email API skill preserves identifier reuse through current scoped Vera tools", async () => {
  const content = await readFile(apiSkillUrl, "utf8");

  assert.match(content, /Prefer Vera-native tools already mounted/i);
  assert.match(content, /Reuse supplied source content and already verified task\/channel\/account\/folder\/message IDs/i);
  assert.match(content, /Do not restart an identified email task/i);
  assert.match(content, /Never claim an email was reviewed from its subject or snippet alone/i);
  assert.match(content, /Never replace a denied operation with raw HTTP\/database access or another principal\/connector/i);
  assert.doesNotMatch(content, /http:\/\/localhost:4321\/(?:fetchEmail|downloadAttachment|searchEmails)/i);
  await assert.rejects(
    readFile(new URL("../skills/cowork-emails/SKILL.md", import.meta.url), "utf8"),
    { code: "ENOENT" },
    "The retired local-mail skill must not be restored to satisfy CI",
  );
});

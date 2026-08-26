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

  assert.match(content, /Do not list channels\/accounts\/folders/i);
  assert.match(content, /do not also load `cowork-emails`/i);
  assert.match(content, /curl\.exe/);
  assert.ok(
    content.indexOf("Inspect attachments before business verification") <
      content.indexOf("Run only the required category checks"),
  );
});

test("PO workflow starts with exact bounded direct Odoo searches", async () => {
  const content = await readFile(poUrl, "utf8");

  assert.match(content, /direct mounted Odoo tools only/i);
  assert.match(content, /default_code/);
  assert.match(content, /limit: 5/);
  assert.match(content, /Never start with `name ilike/);
  assert.doesNotMatch(content, /\/odoo\/models\/search/);
  assert.doesNotMatch(content, /TOKEN=\$\(cat/);
});

test("email API skill exposes the local identifier fast path first", async () => {
  const content = await readFile(apiSkillUrl, "utf8");

  assert.ok(content.indexOf("## Fast path before discovery") < content.indexOf("## Base URL"));
  assert.match(content, /Do \*\*not\*\* list remote channels\/accounts\/folders first/);
});

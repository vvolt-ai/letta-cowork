import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const retired = [
  'cowork-emails',
  'processed-email-details',
  'cowork-memory',
  'mails',
  'cowork-odoo',
  'odoo-direct',
  'odoo-mcp-ngrok',
  'neo4j-mcp',
];

test('obsolete integration skills are not bundled as active instructions', () => {
  for (const name of retired) {
    assert.equal(
      existsSync(join(root, name, 'SKILL.md')),
      false,
      `${name} must not reappear in the active catalog`,
    );
  }
});

test('retained skill instruction names match their installed folders', () => {
  let count = 0;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const file = join(root, entry.name, 'SKILL.md');
    if (!entry.isDirectory() || !existsSync(file)) continue;
    const text = readFileSync(file, 'utf8');
    assert.equal(/^name:\s*(.+)$/m.exec(text)?.[1], entry.name);
    count++;
  }
  assert(count >= 3, 'Retained current integration skills must remain available');
});

test('current scoped Vera and configured Odoo routes stay available', () => {
  assert.match(
    readFileSync(join(root, 'vera-mcp', 'SKILL.md'), 'utf8'),
    /Prefer Vera-native tools/,
  );
  assert.match(
    readFileSync(join(root, 'cowork-mcp', 'SKILL.md'), 'utf8'),
    /configured.*MCP|MCP.*configured/,
  );
  assert.match(
    readFileSync(join(root, 'email-processing', 'SKILL.md'), 'utf8'),
    /configured.MCP|configured MCP/,
  );
});

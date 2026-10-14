// Static guide checks only, not a mod installation, login or authorization test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const main=await readFile(new URL('../SKILL.md',import.meta.url),'utf8');
const setup=await readFile(new URL('../references/vera-mod-setup.md',import.meta.url),'utf8');
const client=await readFile(new URL('./call-mcp.mjs',import.meta.url),'utf8');
test('Odoo uses enabled scoped configured MCP and no native fallback',()=>{
 assert.ok(main.includes('Configured Odoo MCP'));
 assert.ok(main.includes('retired'));assert.ok(main.includes('configured_connectors'));
 assert.ok(main.includes('current organization/user/profile scope'));assert.ok(main.includes('is not an Odoo/configured-connector proxy'));
 assert.ok(!main.includes('Odoo lookups; use direct mounted Odoo tools when available'));
 const allowed=client.slice(client.indexOf('const ALLOWED_TOOLS'),client.indexOf('const MAX_INPUT_BYTES'));
 assert.ok(!allowed.includes("'odoo_search'"));
});
test('setup uses verified installer and private connection after approval',()=>{
 assert.ok(setup.includes('>=0.28.0'));assert.ok(setup.includes('letta install .'));
 for(const command of ['/reload','/vera-connect','/vera-status','/vera-sync'])assert.ok(setup.includes(command));
 assert.ok(setup.includes('obtain the user\'s approval'));assert.ok(setup.includes('MOD.md'));
 assert.ok(setup.includes('never ask the user to paste an OTP'));
});
test('routing distinguishes fallback subset, native origin, knowledge and action receipts',async()=>{
 const routing=await readFile(new URL('../references/capability-routing.md',import.meta.url),'utf8');
 assert.ok(main.includes('not the full native catalog'));
 assert.ok(main.includes('required accessible `channelId`'));
 assert.ok(main.includes('not the prefix alone'));
 for(const topic of ['Email','Channels','Schedules','Profiles','Remote','Configured MCP','Skills','Contacts/delegation'])assert.ok(routing.includes(topic));
 assert.ok(routing.includes('does not replace live mailbox reads'));
 assert.ok(routing.includes('does not prove owned agent/job termination'));
 assert.ok(routing.includes('draft only after explicit authorization'));
 assert.ok(main.includes('envelope **and inner data**'));
});

test('runtime/permission/account failures do not trigger inappropriate installs',()=>{
 assert.ok(setup.includes('Vera web user is signed out'));assert.ok(setup.includes('Server/channel/MCP-only'));
 assert.ok(setup.includes('login/reinstall does not fix it'));assert.ok(setup.includes('approved invitation/account route'));
 assert.ok(setup.includes('public 404 is not proof'));assert.ok(setup.includes('no retired `/odoo/*` REST fallback'));
 assert.ok(setup.includes('Preserve task/email/attachment references'));
});

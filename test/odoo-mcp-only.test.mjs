import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { getClientToolsForWire, isClientTool, runClientTool } from '../dist-electron/services/client-tools/index.js';
import { buildTurnReminders, createReminderState } from '../dist-electron/libs/runner/plan-mode/reminders.js';
import { PlanModeManager } from '../dist-electron/libs/runner/plan-mode/mode-manager.js';

test('only configured-MCP discovery/call remains exposed, not legacy Odoo mounts', () => {
  const names=getClientToolsForWire().map(tool=>tool.name);
  assert.ok(names.includes('VeraMcpListTools'));
  assert.ok(names.includes('VeraMcpCallTool'));
  assert.deepEqual(names.filter(name=>/^odoo_/.test(name)||name==='OdooAttachPdf'),[]);
  assert.equal(isClientTool('odoo_search'),false);
  assert.equal(isClientTool('odoo_create'),false);
  assert.equal(isClientTool('OdooAttachPdf'),false);
});

test('a stale bare Odoo call is rejected without falling back to an API route',async()=>{
  const result=await runClientTool('odoo_search',{model:'calendar.event',limit:1},{signal:new AbortController().signal});
  assert.equal(result.isError,true);
  assert.match(result.output,/unknown|not found|not registered/i);
});

test('turn guidance selects discovered Vera MCP names, not mounted bare tools',()=>{
  const output=buildTurnReminders({planMode:new PlanModeManager(),state:createReminderState(),workingDirectory:'/fixture'});
  assert.match(output,/VeraMcpListTools/);
  assert.match(output,/VeraMcpCallTool/);
  assert.match(output,/Legacy mounted bare odoo_\* tools and OdooAttachPdf are retired/);
  assert.doesNotMatch(output,/always use direct mounted/);
});

test('compiled legacy Odoo transports are pruned rather than shipped stale',()=>{
  for(const file of ['odooMcp','odooAttachment'])assert.equal(existsSync(new URL(`../dist-electron/services/client-tools/runners/${file}.js`,import.meta.url)),false);
});

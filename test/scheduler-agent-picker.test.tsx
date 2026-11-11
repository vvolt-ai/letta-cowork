import {expect,test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import {CreateScheduleDialog} from '../src/ui/features/scheduler/CreateScheduleDialog';

test('create and edit schedules mount a self-loading agent picker without a parent agent cache',()=>{
 for(const mode of ['create','edit'] as const){const html=renderToStaticMarkup(<CreateScheduleDialog open mode={mode} onClose={()=>{}} onSave={async()=>{throw Error('No writes in this test');}}/>);expect(html).toContain('Select an agent');expect(html).toContain(mode==='edit'?'Edit schedule':'Create schedule');expect(html).not.toContain('<option value="">Select an agent');}
});
test('both navigation paths mount schedules without the standalone-only preload state',()=>{
 const app=readFileSync(new URL('../src/ui/App.tsx',import.meta.url),'utf8');
 expect((app.match(/<SchedulesPanel\b/g)??[]).length).toBe(2);
 expect(app).not.toContain('scheduleAgents');expect(app).not.toContain('setScheduleAgents');
 const dialog=readFileSync(new URL('../src/ui/features/scheduler/CreateScheduleDialog.tsx',import.meta.url),'utf8');
 expect(dialog).toContain('<AgentDropdown');expect(dialog).not.toContain('agents.map');
});
test('closed schedule dialogs do not mount the picker',()=>{expect(renderToStaticMarkup(<CreateScheduleDialog open={false} onClose={()=>{}} onSave={async()=>{}}/>)).toBe('');});

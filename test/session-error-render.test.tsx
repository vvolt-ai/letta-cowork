import {expect,test} from 'bun:test';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ChatTimeline} from '../src/ui/features/chat/components/ChatTimeline';
import {TEMPORARY_SESSION_ERROR} from '../src/electron/libs/runner/session-error-display';
for(const status of ['idle','waiting_approval','error'] as const)test('failure notice is rendered for '+status,()=>{
 const html=renderToStaticMarkup(<ChatTimeline messages={[]} activeSessionId="fixture-render" agentStatus={status} showPartialMessage={false} errorMessage={TEMPORARY_SESSION_ERROR}/>);expect(html).toContain('role="alert"');expect(html).toContain('5 minutes');expect(html).toContain('Couldn’t complete this request');expect(html).not.toContain('conversation_retrieve-');
});

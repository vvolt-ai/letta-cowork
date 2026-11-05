import {beforeEach,expect,test} from 'bun:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {useAppStore} from '../src/ui/store/useAppStore';
import {clearAssistantDraft,getAssistantDraft} from '../src/ui/store/assistantDraftStore';
import {requestConversationStop,markStopRequested,hasUnsettledStop,refuseInputDuringStop,isPromptTurnRunning} from '../src/ui/utils/request-stop';
import {ConversationHeader} from '../src/ui/features/chat/components/ConversationHeader';
import {PromptTextArea} from '../src/ui/features/chat/components/PromptInput/PromptTextArea';
const id='verified-stop-ui',client='current-client';
const emit=(event:any)=>useAppStore.getState().handleServerEvent(event);
const state=()=>useAppStore.getState().sessions[id];
const phase=(stopState:string,stopRequestId='stop-one')=>emit({type:'session.status',payload:{sessionId:id,status:stopState==='verified'?'idle':stopState==='unverified'?'error':'running',stopState,stopRequestId,error:stopState==='unverified'?'SDK_STOP_NOT_VERIFIED':undefined}});
beforeEach(()=>{clearAssistantDraft(id);useAppStore.setState({sessions:{},activeSessionId:id,prompt:'typed next instruction',pendingStart:false,globalError:null,notifications:[],fetchSessionHistory:()=>undefined,ipcSendEvent:undefined});emit({type:'session.status',payload:{sessionId:id,status:'running'}});emit({type:'stream.user_prompt',payload:{sessionId:id,prompt:'previous instruction'}});emit({type:'stream.message',payload:{sessionId:id,message:{type:'assistant',content:'Observed answer',uuid:'observed-answer',clientRunId:client}}});});
test('Stop intent retains active state, pending cards and received text rather than optimistic Idle',()=>{
 emit({type:'permission.request',payload:{sessionId:id,toolUseId:'fixture-call',toolName:'Read',input:{}}});const sent:any[]=[];requestConversationStop(id,e=>sent.push(e));expect(sent).toEqual([{type:'session.stop',payload:{sessionId:id}}]);expect(state().status).toBe('running');expect(state().ephemeral.stopState).toBe('stopping');expect(state().permissionRequests).toHaveLength(1);expect(getAssistantDraft(id)?.content).toBe('Observed answer');expect(hasUnsettledStop(state())).toBe(true);requestConversationStop(id,e=>sent.push(e));expect(sent).toHaveLength(1);
});
test('unverified failure keeps a warning but permits ordinary input without losing typed text',()=>{
 requestConversationStop(id,()=>{});phase('stopping');phase('unverified');expect(state().status).toBe('error');expect(state().ephemeral.stopState).toBe('unverified');expect(state().ephemeral.errorMessage).toContain('check the previous outcome');expect(refuseInputDuringStop(id)).toBe(false);expect(isPromptTurnRunning(state())).toBe(false);expect(useAppStore.getState().prompt).toBe('typed next instruction');expect(state().messages.some((m:any)=>m.type==='assistant'&&m.content==='Observed answer')).toBe(true);expect(useAppStore.getState().notifications).toHaveLength(0);
});
test('a late SDK result or unstamped cleanup cannot turn an unverified stop into completion',()=>{
 requestConversationStop(id,()=>{});phase('stopping');phase('unverified');emit({type:'stream.message',payload:{sessionId:id,message:{type:'result',success:true,durationMs:1,clientRunId:client}}});for(const status of ['idle','completed'])emit({type:'session.status',payload:{sessionId:id,status}});expect(state().status).toBe('error');expect(state().ephemeral.stopState).toBe('unverified');expect(state().ephemeral.errorMessage).toContain('check the previous outcome');
});
test('a stopped stream result does not claim completion while exact Stop proof is pending',()=>{
 requestConversationStop(id,()=>{});phase('stopping');emit({type:'stream.message',payload:{sessionId:id,message:{type:'result',success:true,durationMs:1,clientRunId:client}}});expect(state().status).toBe('running');expect(state().ephemeral.stopState).toBe('stopping');expect(state().ephemeral.pendingResultStatus).toBeUndefined();emit({type:'session.status',payload:{sessionId:id,status:'error',error:'SDK_SESSION_CLOSED'}});expect(state().ephemeral.stopState).toBe('stopping');expect(state().ephemeral.errorMessage).toBeUndefined();
});
test('matching verified retry alone clears warning and cards and allows a new input',()=>{
 requestConversationStop(id,()=>{});phase('stopping');phase('unverified');const sent:any[]=[];requestConversationStop(id,e=>sent.push(e));expect(sent).toHaveLength(1);phase('verified','stop-one');expect(state().ephemeral.stopState).toBe('stopping');phase('stopping','stop-two');phase('verified','other-stop');expect(state().ephemeral.stopState).toBe('stopping');phase('verified','stop-two');expect(state().status).toBe('idle');expect(state().ephemeral.status).toBe('idle');expect(state().ephemeral.stopState).toBeUndefined();expect(state().ephemeral.errorMessage).toBeUndefined();expect(refuseInputDuringStop(id)).toBe(false);
});
test('a verified Stop does not remain stuck on a pending approval UI card',()=>{
 emit({type:'permission.request',payload:{sessionId:id,toolUseId:'fixture-call',toolName:'Read',input:{}}});requestConversationStop(id,()=>{});phase('stopping');phase('verified');expect(state().permissionRequests).toHaveLength(0);expect(state().ephemeral.status).toBe('idle');
});
test('failed stop-and-continue restores an emptied composer but never overwrites newer user typing',()=>{
 markStopRequested(id,{queuedPrompt:'combined instruction',typedText:'additional instruction'});useAppStore.setState({prompt:''});phase('stopping');phase('unverified');expect(useAppStore.getState().prompt).toBe('additional instruction');requestConversationStop(id,()=>{});phase('stopping','stop-two');useAppStore.setState({prompt:'newer user typing'});phase('unverified','stop-two');expect(useAppStore.getState().prompt).toBe('newer user typing');
});
test('another selected chat does not receive the failed stop-and-continue draft',()=>{
 markStopRequested(id,{queuedPrompt:'combined instruction',typedText:'private A draft'});phase('stopping');useAppStore.setState({activeSessionId:'other-chat',prompt:''});phase('unverified');expect(useAppStore.getState().prompt).toBe('');
});
test('history and new prompt events cannot bypass a pending/unverified stop',()=>{
 requestConversationStop(id,()=>{});phase('stopping');emit({type:'session.history',payload:{sessionId:id,status:'completed',messages:[],hasMore:false}});emit({type:'stream.user_prompt',payload:{sessionId:id,prompt:'should not be accepted'}});expect(state().ephemeral.stopState).toBe('stopping');expect(state().messages.some((m:any)=>m.type==='user_prompt'&&m.prompt==='should not be accepted')).toBe(false);phase('verified');emit({type:'stream.user_prompt',payload:{sessionId:id,prompt:'accepted after proof'}});expect(state().ephemeral.stopState).toBeUndefined();expect(state().lastPrompt).toBe('accepted after proof');phase('verified');expect(state().ephemeral.status).toBe('thinking');
});
test('a completion-verification warning permits new intent and still exposes Stop retry',()=>{
 emit({type:'session.status',payload:{sessionId:id,status:'error',error:'SDK_RUN_VERIFICATION_TIMEOUT'}});expect(state().ephemeral.stopState).toBeUndefined();expect(hasUnsettledStop(state())).toBe(true);expect(refuseInputDuringStop(id)).toBe(false);expect(isPromptTurnRunning(state())).toBe(false);const sent:any[]=[];requestConversationStop(id,e=>sent.push(e));expect(sent).toHaveLength(1);expect(state().ephemeral.stopState).toBe('stopping');phase('stopping');phase('verified');expect(hasUnsettledStop(state())).toBe(false);
});
test('owned-controller and no-controller failures do not advise a blind five-minute resend',()=>{
 emit({type:'session.status',payload:{sessionId:id,status:'error',error:'SDK_CONVERSATION_ALREADY_OWNED'}});expect(state().ephemeral.errorMessage).toContain('check the previous outcome');expect(hasUnsettledStop(state())).toBe(true);requestConversationStop(id,()=>{});phase('stopping');emit({type:'session.status',payload:{sessionId:id,status:'error',stopState:'unverified',stopRequestId:'stop-one',error:'SDK_STOP_SCOPE_UNAVAILABLE'}});expect(state().ephemeral.errorMessage).toContain('No unambiguous local controller');expect(state().ephemeral.errorMessage).not.toContain('5 minutes');
});
test('new backend-admitted intent starts normally while retaining prior stop uncertainty as a separate warning',()=>{
 requestConversationStop(id,()=>{});phase('stopping');phase('unverified');expect(isPromptTurnRunning(state())).toBe(false);
 emit({type:'stream.user_prompt',payload:{sessionId:id,prompt:'new independent instruction',afterStop:true}});expect(state().lastPrompt).toBe('new independent instruction');expect(state().ephemeral.stopState).toBeUndefined();expect(state().ephemeral.errorMessage).toBeUndefined();expect(state().ephemeral.stopWarning).toContain('could not be confirmed stopped');expect(state().ephemeral.status).toBe('thinking');expect(isPromptTurnRunning(state())).toBe(true);
 phase('unverified','stop-one');expect(state().ephemeral.status).toBe('thinking');
 emit({type:'stream.message',payload:{sessionId:id,message:{type:'result',success:false,errorCode:'error',errorDetail:'502 Scoped SDK provider relay failed',durationMs:1,clientRunId:'new-client'}}});expect(state().ephemeral.status).toBe('error');expect(isPromptTurnRunning(state())).toBe(false);expect(state().ephemeral.stopWarning).toContain('could not be confirmed stopped');
});
test('typing and new-intent admission remain possible while Stop is still pending',()=>{requestConversationStop(id,()=>{});phase('stopping');expect(isPromptTurnRunning(state())).toBe(false);expect(refuseInputDuringStop(id)).toBe(false);expect(useAppStore.getState().prompt).toBe('typed next instruction');});
test('a generic relay failure is not an input lock even when an old approval card remains',()=>{emit({type:'permission.request',payload:{sessionId:id,toolUseId:'old-call',toolName:'Read',input:{}}});emit({type:'session.status',payload:{sessionId:id,status:'error',error:'502 Scoped SDK provider relay failed'}});expect(state().ephemeral.errorMessage).toBeTruthy();expect(state().permissionRequests).toHaveLength(1);expect(isPromptTurnRunning(state())).toBe(false);});
test('rendered composer exposes an enabled Send button after unverified Stop, including old approval state',()=>{
 emit({type:'permission.request',payload:{sessionId:id,toolUseId:'pending-old',toolName:'Read',input:{}}});requestConversationStop(id,()=>{});phase('stopping');phase('unverified');
 const noop=()=>{};const html=renderToStaticMarkup(createElement(PromptTextArea,{prompt:'new instruction',disabled:state().ephemeral.status==='waiting_approval'&&!hasUnsettledStop(state()),isRunning:isPromptTurnRunning(state()),isUploading:false,canSend:true,placeholder:'Message',promptRef:{current:null},onPromptChange:noop,onKeyDown:noop,onPaste:noop,onAttach:noop,onSend:noop,onStop:noop}));
 expect(html).toContain('aria-label="Send prompt"');expect(html).not.toContain('aria-label="Stop session"');expect(html).not.toMatch(/aria-label="Send prompt"[^>]*disabled/);expect(html).not.toMatch(/<textarea[^>]*\sdisabled(?:=|\s|>)/);expect(state().permissionRequests).toHaveLength(1);
});
test('queued admission is visible, deduplicated and removed only on dispatch or cancellation',()=>{
 requestConversationStop(id,()=>{});phase('stopping');phase('unverified');
 const admission=(requestId:string,status:string)=>emit({type:'session.messageAdmission',payload:{sessionId:id,requestId,state:status}});
 admission('next-one','queued');admission('next-one','queued');admission('next-two','queued');expect(state().ephemeral.queuedMessageRequests).toEqual(['next-one','next-two']);expect(isPromptTurnRunning(state())).toBe(false);
 admission('next-one','dispatched');emit({type:'stream.user_prompt',payload:{sessionId:id,prompt:'next instruction',afterStop:true}});expect(state().ephemeral.queuedMessageRequests).toEqual(['next-two']);expect(state().ephemeral.stopWarning).toBeTruthy();admission('next-two','cancelled');expect(state().ephemeral.queuedMessageRequests).toEqual([]);
});
test('header distinguishes Stopping and Stop unverified from finalising or completion',()=>{
 const html=(stopState:any)=>renderToStaticMarkup(createElement(ConversationHeader,{title:'Fixture',agentName:'Fixture',status:'generating',verifyingCompletion:true,stopState}));expect(html('stopping')).toContain('Stopping');expect(html('stopping')).not.toContain('Verifying completion');expect(html('unverified')).toContain('Stop unverified');expect(html('unverified')).not.toContain('Completed');
});

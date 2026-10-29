import {expect,test,beforeEach} from 'bun:test';
import {useAppStore} from '../src/ui/store/useAppStore';
const id='fixture-failed-chat';
const emit=(event:any)=>useAppStore.getState().handleServerEvent(event);
const status=(value:string,error?:string,sessionId=id)=>emit({type:'session.status',payload:{sessionId,status:value,error}});
const prompt=(text='fixture user text')=>emit({type:'stream.user_prompt',payload:{sessionId:id,prompt:text}});
const state=()=>useAppStore.getState().sessions[id];
beforeEach(()=>{useAppStore.setState({sessions:{},activeSessionId:id,pendingStart:false,globalError:null,notifications:[],fetchSessionHistory:()=>undefined,ipcSendEvent:undefined});status('running');prompt();});
test('initialization timeout is visible and cleanup idle/completed cannot erase it',()=>{
 status('error','Timed out waiting for conversation_retrieve-fixture');expect(state().ephemeral.status).toBe('error');expect(state().ephemeral.errorMessage).toContain('5 minutes');const message=state().ephemeral.errorMessage;
 status('idle');expect(state().ephemeral.status).toBe('error');expect(state().ephemeral.errorMessage).toBe(message);status('completed');expect(state().ephemeral.errorMessage).toBe(message);expect(state().status).toBe('error');
});
test('history refresh preserves failed prompt and visible failure',()=>{
 status('error','fetch failed');const message=state().ephemeral.errorMessage;emit({type:'session.history',payload:{sessionId:id,status:'idle',messages:[{type:'assistant',uuid:'older-server-row',content:'fixture history',createdAt:Date.now()+10000}],hasMore:false}});expect(state().ephemeral.errorMessage).toBe(message);expect(state().messages.some((m:any)=>m.type==='user_prompt'&&m.prompt==='fixture user text')).toBe(true);
});
test('new user attempt clears old failure without automatic resend',()=>{
 status('error','ECONNRESET');status('idle');expect(state().ephemeral.errorMessage).toBeDefined();prompt('explicit second attempt');expect(state().ephemeral.errorMessage).toBeUndefined();expect(state().ephemeral.status).toBe('thinking');expect(state().messages.filter((m:any)=>m.type==='user_prompt')).toHaveLength(2);
});
test('another chat failure does not contaminate the selected conversation',()=>{
 status('error','fetch failed','fixture-other-chat');expect(state().ephemeral.errorMessage).toBeUndefined();expect(useAppStore.getState().sessions['fixture-other-chat'].ephemeral.errorMessage).toContain('5 minutes');
});
test('permission and scope errors do not falsely promise a five-minute fix',()=>{
 status('error','HTTP 403 forbidden');expect(state().ephemeral.errorMessage).toContain('permission');expect(state().ephemeral.errorMessage).not.toContain('5 minutes');status('error','SDK_RUNTIME_SCOPE_MISMATCH');expect(state().ephemeral.errorMessage).toContain('does not match');expect(state().ephemeral.errorMessage).not.toContain('5 minutes');
});
test('pending permission state and failure both survive cleanup',()=>{
 emit({type:'permission.request',payload:{sessionId:id,toolUseId:'fixture-call',toolName:'Write',input:{file_path:'fixture'}}});status('error','fetch failed');status('idle');expect(state().ephemeral.status).toBe('waiting_approval');expect(state().ephemeral.errorMessage).toContain('5 minutes');expect(state().permissionRequests).toHaveLength(1);emit({type:'permission.cancelled',payload:{sessionId:id,toolUseId:'fixture-call'}});expect(state().ephemeral.status).toBe('error');expect(state().permissionRequests).toHaveLength(0);expect(state().ephemeral.pendingResultStatus).toBeUndefined();
});
test('failed final result gets friendly guidance and SDK error is shown during recovery',()=>{
 emit({type:'stream.message',payload:{sessionId:id,message:{type:'error',message:'fetch failed'}}});expect(state().ephemeral.recoveryMessage).toContain('5 minutes');emit({type:'stream.message',payload:{sessionId:id,message:{type:'result',success:false,error:'Timed out waiting for runtime-start-fixture',durationMs:1}}});expect(state().ephemeral.status).toBe('error');expect(state().ephemeral.errorMessage).toContain('5 minutes');
});
test('new-session failure retains the pending prompt and surfaces friendly global feedback',()=>{
 useAppStore.setState({prompt:'pending new chat draft',pendingStart:true});emit({type:'runner.error',payload:{message:'Timed out waiting for conversation_retrieve-fixture'}});expect(useAppStore.getState().prompt).toBe('pending new chat draft');expect(useAppStore.getState().globalError).toContain('5 minutes');expect(useAppStore.getState().pendingStart).toBe(false);
});

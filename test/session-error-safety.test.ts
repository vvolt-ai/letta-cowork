import {expect,test} from 'bun:test';
import {useAppStore} from '../src/ui/store/useAppStore';
const id='fixture-error-safety';
const status=(error:string)=>useAppStore.getState().handleServerEvent({type:'session.status',payload:{sessionId:id,status:'error',error}});
test('arbitrary quoted model errors are not rendered or persisted as model IDs',()=>{
 const rejected:string[]=[];useAppStore.setState({sessions:{},activeSessionId:id,pendingStart:false,selectedModel:'known/model',markModelRejected:(name)=>{rejected.push(name);},fetchSessionHistory:()=>undefined});status('Invalid model "PRIVATE_FIXTURE_VALUE?token=DO_NOT_DISPLAY"');expect(useAppStore.getState().sessions[id].ephemeral.errorMessage).not.toContain('PRIVATE_FIXTURE');expect(rejected).toHaveLength(0);expect(useAppStore.getState().selectedModel).toBe('known/model');
});
test('new-session timeout cannot replace a stop-unverified warning after cleanup',()=>{
 useAppStore.setState({globalError:null,pendingStart:true,prompt:'fixture new draft'});const send=(message:string)=>useAppStore.getState().handleServerEvent({type:'runner.error',payload:{message}});send('Timed out waiting for conversation_retrieve-fixture');send('SDK_STOP_NOT_VERIFIED timeout');send('Timed out waiting for conversation_retrieve-fixture');expect(useAppStore.getState().globalError).toContain('Do not resend');expect(useAppStore.getState().globalError).not.toContain('5 minutes');expect(useAppStore.getState().prompt).toBe('fixture new draft');
});
test('a repeated timeout cannot erase an unverified-stop warning',()=>{
 useAppStore.setState({sessions:{},activeSessionId:id,pendingStart:false,fetchSessionHistory:()=>undefined});status('SDK_STOP_NOT_VERIFIED timeout');status('Timed out waiting for conversation_retrieve-fixture');expect(useAppStore.getState().sessions[id].ephemeral.errorMessage).toContain('Do not resend');expect(useAppStore.getState().sessions[id].ephemeral.errorMessage).not.toContain('5 minutes');
});

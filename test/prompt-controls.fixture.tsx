import {createRoot} from 'react-dom/client';
import '../src/ui/index.css';
import {PromptInput} from '../src/ui/features/chat/components/PromptInput';
import {useAppStore} from '../src/ui/store/useAppStore';
const models = [
  {name:'fixture/model-a',display_name:'Fixture model A',provider_type:'openai',provider_category:'base'},
  {name:'fixture/model-b',display_name:'Fixture model B',provider_type:'openai',provider_category:'byok'},
];
const calls: string[]=[];
window.electron={
  getLettaEnv:async()=>({LETTA_AGENT_ID:'fixture-agent'}),
  listLettaModels:async()=>models,
  getLettaAgent:async()=>({id:'fixture-agent',model:'fixture/model-a'}),
} as unknown as typeof window.electron;
useAppStore.getState().resetOrganizationState();
useAppStore.setState({activeSessionId:null,newConversationAgentId:'fixture-agent',selectedModel:'fixture/model-a',permissionMode:'unrestricted',showReasoningInChat:true,cwd:'/fixture',prompt:'',pendingStart:false});
const panel=new URLSearchParams(location.search).has('panel');
(window as any).promptFixture={snapshot:()=>{const state=useAppStore.getState();return{model:state.selectedModel,permission:state.permissionMode,reasoning:state.showReasoningInChat,prompt:state.prompt,calls};}};
createRoot(document.getElementById('root')!).render(
  <main style={{padding:16,paddingTop:500,maxWidth:panel?400:1100,margin:panel?0:'auto'}}>
    <PromptInput fullWidth={panel} sendEvent={event=>calls.push(event.type)} />
  </main>,
);
